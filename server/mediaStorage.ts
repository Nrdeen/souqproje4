import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

export type MediaStorageProvider = 'local' | 's3' | 'r2' | 'gcs';

export interface MediaStorageConfig {
  provider: MediaStorageProvider;
  bucket: string | null;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
  keyPrefix?: string;
}

export interface MediaObjectRef {
  provider?: MediaStorageProvider;
  bucket?: string | null;
  objectKey: string;
}

export interface PutMediaObjectInput {
  objectKey: string;
  bytes: Buffer;
  mimeType: string;
  sha256Hex?: string;
  metadata?: Record<string, string>;
}

export interface PutMediaObjectResult {
  provider: MediaStorageProvider;
  bucket: string | null;
  objectKey: string;
  sizeBytes: number;
  sha256Hex: string;
  etag?: string;
}

export interface MediaHeadResult {
  exists: boolean;
  sizeBytes?: number;
  mimeType?: string;
  etag?: string;
  sha256Hex?: string;
}

export interface MediaReadRange {
  start: number;
  end: number;
}

export interface MediaReadResult {
  stream: NodeJS.ReadableStream;
  totalBytes: number;
  contentLength: number;
  start: number;
  end: number;
  isPartial: boolean;
  mimeType?: string;
  etag?: string;
}

export interface MediaStorageAdapter {
  readonly provider: MediaStorageProvider;
  readonly bucket: string | null;
  putObject(input: PutMediaObjectInput): Promise<PutMediaObjectResult>;
  headObject(ref: MediaObjectRef): Promise<MediaHeadResult>;
  getObjectStream(ref: MediaObjectRef, range?: MediaReadRange): Promise<MediaReadResult | null>;
  deleteObject(ref: MediaObjectRef): Promise<void>;
  healthCheck(): Promise<boolean>;
}

const VALID_MEDIA_FILENAME_RE = /^med_[a-f0-9-]+\.(jpg|png|webp|mp4|mov|webm)$/i;

export function computeSha256Hex(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export async function computeStreamSha256Hex(
  stream: NodeJS.ReadableStream
): Promise<{ sha256Hex: string; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    let sizeBytes = 0;
    stream.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      sizeBytes += buf.length;
      hash.update(buf);
    });
    stream.once('end', () => {
      resolve({ sha256Hex: hash.digest('hex'), sizeBytes });
    });
    stream.once('error', reject);
  });
}

export function sanitizeKeyPrefix(rawPrefix: string | undefined): string | undefined {
  if (!rawPrefix) return undefined;
  const trimmed = rawPrefix.trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) return undefined;
  const segments = trimmed.split('/').filter(Boolean);
  for (const seg of segments) {
    if (seg === '.' || seg === '..' || /[\u0000\\]/.test(seg)) {
      throw new Error(`Invalid MEDIA_KEY_PREFIX segment: "${seg}"`);
    }
  }
  return segments.join('/');
}

export function normalizeObjectKey(objectKey: string): string {
  const clean = String(objectKey || '').trim().replace(/^\/+/, '');
  if (!clean || clean.includes('\\') || clean.includes('\u0000')) {
    throw new Error('Invalid media object key');
  }
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p === '.' || p === '..')) {
    throw new Error('Invalid media object key path');
  }
  const leaf = parts[parts.length - 1];
  if (!VALID_MEDIA_FILENAME_RE.test(leaf)) {
    throw new Error(`Invalid media filename in object key: ${leaf}`);
  }
  return parts.join('/');
}

export function buildObjectKey(filename: string, keyPrefix?: string): string {
  if (!VALID_MEDIA_FILENAME_RE.test(filename)) {
    throw new Error(`Invalid media filename: ${filename}`);
  }
  const cleanPrefix = sanitizeKeyPrefix(keyPrefix);
  return cleanPrefix ? `${cleanPrefix}/${filename}` : filename;
}

export function resolveAssetObjectRef(asset: {
  filename: string;
  storageProvider?: MediaStorageProvider;
  bucket?: string | null;
  objectKey?: string;
}): MediaObjectRef {
  return {
    provider: asset.storageProvider || 'local',
    bucket: asset.bucket ?? null,
    objectKey: asset.objectKey || asset.filename,
  };
}

export type ParsedHttpRange =
  | { ok: true; isPartial: false }
  | { ok: true; isPartial: true; start: number; end: number }
  | { ok: false; status: 416; totalBytes: number };

/**
 * Parses an HTTP Range header (RFC 9110 single-byte range).
 * Returns `isPartial: false` if no Range header (or a multi-part range) is present.
 */
export function parseHttpByteRange(
  rangeHeader: string | string[] | undefined,
  totalBytes: number
): ParsedHttpRange {
  const raw = Array.isArray(rangeHeader) ? rangeHeader[0] : rangeHeader;
  if (!raw || !raw.trim()) {
    return { ok: true, isPartial: false };
  }

  const trimmed = raw.trim();
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) {
    return { ok: false, status: 416, totalBytes };
  }
  const unit = trimmed.slice(0, eqIdx).trim().toLowerCase();
  const spec = trimmed.slice(eqIdx + 1).trim();
  if (unit !== 'bytes' || !spec) {
    return { ok: false, status: 416, totalBytes };
  }

  // Fallback gracefully to full response on multi-range requests (rare in HTML5 video players).
  if (spec.includes(',')) {
    return { ok: true, isPartial: false };
  }

  if (totalBytes <= 0) {
    return { ok: false, status: 416, totalBytes };
  }

  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (!match || (!match[1] && !match[2])) {
    return { ok: false, status: 416, totalBytes };
  }

  let start: number;
  let end: number;

  if (!match[1]) {
    // Suffix byte range: bytes=-N
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) {
      return { ok: false, status: 416, totalBytes };
    }
    start = Math.max(0, totalBytes - suffix);
    end = totalBytes - 1;
  } else {
    start = Number(match[1]);
    if (!Number.isSafeInteger(start) || start < 0 || start >= totalBytes) {
      return { ok: false, status: 416, totalBytes };
    }
    if (!match[2]) {
      end = totalBytes - 1;
    } else {
      end = Number(match[2]);
      if (!Number.isSafeInteger(end) || end < start) {
        return { ok: false, status: 416, totalBytes };
      }
      end = Math.min(end, totalBytes - 1);
    }
  }

  return { ok: true, isPartial: true, start, end };
}

function parseContentRangeHeader(
  value: string | null,
  fallbackStart: number,
  fallbackLength: number
): { start: number; end: number; total: number } | null {
  if (!value) return null;
  const m = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(value.trim());
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  const total = m[3] === '*' ? fallbackStart + fallbackLength : Number(m[3]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(total)) {
    return null;
  }
  return { start, end, total };
}

/**
 * Local filesystem adapter storing uploads safely inside an isolated directory.
 */
export class LocalMediaStorageAdapter implements MediaStorageAdapter {
  public readonly provider = 'local' as const;
  public readonly bucket = null;
  private readonly resolvedRoot: string;

  constructor(public readonly uploadsDir: string) {
    this.resolvedRoot = path.resolve(uploadsDir);
  }

  private resolveSafeKeyPath(objectKey: string): string {
    const cleanKey = normalizeObjectKey(objectKey);
    const resolved = path.resolve(this.resolvedRoot, cleanKey);
    if (!resolved.startsWith(this.resolvedRoot + path.sep)) {
      throw new Error('Unsafe local media storage path');
    }
    return resolved;
  }

  async putObject(input: PutMediaObjectInput): Promise<PutMediaObjectResult> {
    const targetPath = this.resolveSafeKeyPath(input.objectKey);
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    const sha256Hex = input.sha256Hex || computeSha256Hex(input.bytes);
    const tmpPath = `${targetPath}.tmp-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
    await fs.promises.writeFile(tmpPath, input.bytes, { mode: 0o600 });
    await fs.promises.rename(tmpPath, targetPath);

    return {
      provider: 'local',
      bucket: null,
      objectKey: normalizeObjectKey(input.objectKey),
      sizeBytes: input.bytes.length,
      sha256Hex,
      etag: `"${sha256Hex}"`,
    };
  }

  async headObject(ref: MediaObjectRef): Promise<MediaHeadResult> {
    try {
      const safePath = this.resolveSafeKeyPath(ref.objectKey);
      const stat = await fs.promises.stat(safePath);
      if (!stat.isFile()) return { exists: false };
      return {
        exists: true,
        sizeBytes: stat.size,
      };
    } catch (err: any) {
      if (err?.code === 'ENOENT') return { exists: false };
      return { exists: false };
    }
  }

  async getObjectStream(ref: MediaObjectRef, range?: MediaReadRange): Promise<MediaReadResult | null> {
    let safePath: string;
    try {
      safePath = this.resolveSafeKeyPath(ref.objectKey);
    } catch {
      return null;
    }

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(safePath);
      if (!stat.isFile()) return null;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }

    const totalBytes = stat.size;
    if (range) {
      const start = Math.max(0, Math.min(range.start, Math.max(0, totalBytes - 1)));
      const end = Math.max(start, Math.min(range.end, Math.max(0, totalBytes - 1)));
      const contentLength = totalBytes === 0 ? 0 : end - start + 1;
      const stream = fs.createReadStream(safePath, { start, end });
      return {
        stream,
        totalBytes,
        contentLength,
        start,
        end,
        isPartial: true,
      };
    }

    const stream = fs.createReadStream(safePath);
    return {
      stream,
      totalBytes,
      contentLength: totalBytes,
      start: 0,
      end: Math.max(0, totalBytes - 1),
      isPartial: false,
    };
  }

  async deleteObject(ref: MediaObjectRef): Promise<void> {
    try {
      const safePath = this.resolveSafeKeyPath(ref.objectKey);
      await fs.promises.rm(safePath, { force: true });
    } catch {
      // ignore missing or invalid file during cleanup
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await fs.promises.mkdir(this.resolvedRoot, { recursive: true, mode: 0o700 });
      await fs.promises.access(this.resolvedRoot, fs.constants.R_OK | fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}

export interface S3AdapterOptions {
  provider: 's3' | 'r2' | 'gcs';
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf-8').digest();
}

function encodeRfc3986PathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeS3ObjectKeyPath(objectKey: string): string {
  return normalizeObjectKey(objectKey)
    .split('/')
    .map((s) => encodeRfc3986PathSegment(s))
    .join('/');
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

export function buildS3ObjectUrl(opts: {
  endpoint: string;
  bucket: string;
  objectKey?: string;
  forcePathStyle: boolean;
  query?: Record<string, string>;
}): URL {
  const base = new URL(opts.endpoint);
  const basePath = base.pathname.replace(/\/+$/, '');
  const encodedKey = opts.objectKey ? encodeS3ObjectKeyPath(opts.objectKey) : '';

  if (opts.forcePathStyle) {
    const encodedBucket = encodeRfc3986PathSegment(opts.bucket);
    base.pathname = encodedKey
      ? `${basePath}/${encodedBucket}/${encodedKey}`
      : `${basePath}/${encodedBucket}`;
  } else {
    base.hostname = `${opts.bucket}.${base.hostname}`;
    base.pathname = encodedKey ? `${basePath}/${encodedKey}` : `${basePath || '/'}`;
  }

  if (opts.query) {
    const keys = Object.keys(opts.query).sort();
    for (const k of keys) {
      base.searchParams.set(k, opts.query[k]);
    }
  }
  return base;
}

export function signAwsSigV4Headers(params: {
  method: string;
  url: URL;
  region: string;
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  payloadHash: string;
  extraHeaders?: Record<string, string>;
  now?: Date;
}): Record<string, string> {
  const service = params.service || 's3';
  const { amzDate, dateStamp } = formatAmzDate(params.now || new Date());

  const headerMap = new Map<string, string>();
  headerMap.set('host', params.url.host);
  headerMap.set('x-amz-date', amzDate);
  headerMap.set('x-amz-content-sha256', params.payloadHash);

  for (const [k, v] of Object.entries(params.extraHeaders || {})) {
    if (v !== undefined && v !== null) {
      headerMap.set(k.toLowerCase(), String(v).trim().replace(/\s+/g, ' '));
    }
  }

  const sortedHeaderKeys = Array.from(headerMap.keys()).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${headerMap.get(k)}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const queryPairs: Array<[string, string]> = [];
  params.url.searchParams.forEach((value, key) => {
    queryPairs.push([encodeRfc3986PathSegment(key), encodeRfc3986PathSegment(value)]);
  });
  queryPairs.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const canonicalQuery = queryPairs.map(([k, v]) => `${k}=${v}`).join('&');

  const canonicalRequest = [
    params.method.toUpperCase(),
    params.url.pathname || '/',
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    params.payloadHash,
  ].join('\n');

  const canonicalHash = crypto.createHash('sha256').update(canonicalRequest, 'utf-8').digest('hex');
  const credentialScope = `${dateStamp}/${params.region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalHash].join('\n');

  const kDate = hmacSha256(`AWS4${params.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, params.region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = hmacSha256(kSigning, stringToSign).toString('hex');

  const outHeaders: Record<string, string> = {};
  for (const k of sortedHeaderKeys) {
    if (k === 'host') continue;
    outHeaders[k] = headerMap.get(k)!;
  }
  outHeaders['authorization'] =
    `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return outHeaders;
}

const EMPTY_SHA256_HEX = computeSha256Hex(Buffer.alloc(0));

/**
 * Private-bucket S3-compatible object storage adapter using AWS Signature Version 4.
 * Supports AWS S3, Cloudflare R2, MinIO, and GCS S3-interoperability endpoints without
 * requiring public bucket ACLs or third-party client bloat.
 */
export class S3CompatibleMediaStorageAdapter implements MediaStorageAdapter {
  public readonly provider: 's3' | 'r2' | 'gcs';
  public readonly bucket: string;
  private readonly region: string;
  private readonly endpoint: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly forcePathStyle: boolean;

  constructor(opts: S3AdapterOptions) {
    this.provider = opts.provider;
    this.bucket = opts.bucket;
    this.region = opts.region;
    this.endpoint = opts.endpoint;
    this.accessKeyId = opts.accessKeyId;
    this.secretAccessKey = opts.secretAccessKey;
    this.forcePathStyle = opts.forcePathStyle;
  }

  private resolveTargetBucket(ref: MediaObjectRef): string {
    return ref.bucket || this.bucket;
  }

  private async signedFetch(params: {
    method: string;
    bucket: string;
    objectKey?: string;
    query?: Record<string, string>;
    body?: Buffer;
    payloadHash?: string;
    extraHeaders?: Record<string, string>;
  }): Promise<Response> {
    const url = buildS3ObjectUrl({
      endpoint: this.endpoint,
      bucket: params.bucket,
      objectKey: params.objectKey,
      forcePathStyle: this.forcePathStyle,
      query: params.query,
    });
    const payloadHash =
      params.payloadHash ?? (params.body ? computeSha256Hex(params.body) : EMPTY_SHA256_HEX);
    const headers = signAwsSigV4Headers({
      method: params.method,
      url,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      payloadHash,
      extraHeaders: params.extraHeaders,
    });

    return fetch(url.toString(), {
      method: params.method,
      headers,
      body: params.body ? new Uint8Array(params.body) : undefined,
    });
  }

  async putObject(input: PutMediaObjectInput): Promise<PutMediaObjectResult> {
    const cleanKey = normalizeObjectKey(input.objectKey);
    const sha256Hex = input.sha256Hex || computeSha256Hex(input.bytes);

    const extraHeaders: Record<string, string> = {
      'content-type': input.mimeType,
      'content-length': String(input.bytes.length),
      'x-amz-meta-sha256': sha256Hex,
    };
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        const cleanMetaKey = k.toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (cleanMetaKey) extraHeaders[`x-amz-meta-${cleanMetaKey}`] = String(v);
      }
    }

    const res = await this.signedFetch({
      method: 'PUT',
      bucket: this.bucket,
      objectKey: cleanKey,
      body: input.bytes,
      payloadHash: sha256Hex,
      extraHeaders,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(
        `Object storage PUT failed (${this.provider} ${res.status}): ${errText.slice(0, 200)}`
      );
    }

    const etag = res.headers.get('etag') || undefined;
    return {
      provider: this.provider,
      bucket: this.bucket,
      objectKey: cleanKey,
      sizeBytes: input.bytes.length,
      sha256Hex,
      etag,
    };
  }

  async headObject(ref: MediaObjectRef): Promise<MediaHeadResult> {
    const res = await this.signedFetch({
      method: 'HEAD',
      bucket: this.resolveTargetBucket(ref),
      objectKey: ref.objectKey,
    });

    if (res.status === 404) {
      return { exists: false };
    }
    if (!res.ok) {
      throw new Error(`Object storage HEAD failed (${this.provider} ${res.status})`);
    }

    const lenHeader = res.headers.get('content-length');
    const sizeBytes = lenHeader ? Number(lenHeader) : undefined;
    return {
      exists: true,
      sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : undefined,
      mimeType: res.headers.get('content-type') || undefined,
      etag: res.headers.get('etag') || undefined,
      sha256Hex: res.headers.get('x-amz-meta-sha256') || undefined,
    };
  }

  async getObjectStream(ref: MediaObjectRef, range?: MediaReadRange): Promise<MediaReadResult | null> {
    const extraHeaders: Record<string, string> = {};
    if (range) {
      extraHeaders['range'] = `bytes=${range.start}-${range.end}`;
    }

    const res = await this.signedFetch({
      method: 'GET',
      bucket: this.resolveTargetBucket(ref),
      objectKey: ref.objectKey,
      extraHeaders,
    });

    if (res.status === 404) {
      return null;
    }
    if (!res.ok || !res.body) {
      throw new Error(`Object storage GET failed (${this.provider} ${res.status})`);
    }

    const contentLength = Number(res.headers.get('content-length') || 0);
    const parsedRange = parseContentRangeHeader(
      res.headers.get('content-range'),
      range?.start ?? 0,
      contentLength
    );

    const isPartial = res.status === 206 && Boolean(parsedRange || range);
    const start = parsedRange?.start ?? (range ? range.start : 0);
    const totalBytes = parsedRange?.total ?? contentLength;
    const end =
      parsedRange?.end ??
      (isPartial && range ? Math.min(range.end, Math.max(0, totalBytes - 1)) : Math.max(0, totalBytes - 1));

    const stream = Readable.fromWeb(res.body as any);
    return {
      stream,
      totalBytes,
      contentLength: contentLength || Math.max(0, end - start + 1),
      start,
      end,
      isPartial,
      mimeType: res.headers.get('content-type') || undefined,
      etag: res.headers.get('etag') || undefined,
    };
  }

  async deleteObject(ref: MediaObjectRef): Promise<void> {
    const res = await this.signedFetch({
      method: 'DELETE',
      bucket: this.resolveTargetBucket(ref),
      objectKey: ref.objectKey,
    });
    if (res.status === 404 || res.status === 204 || res.status === 200 || res.status === 202) {
      return;
    }
    const errText = await res.text().catch(() => '');
    throw new Error(
      `Object storage DELETE failed (${this.provider} ${res.status}): ${errText.slice(0, 200)}`
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.signedFetch({
        method: 'HEAD',
        bucket: this.bucket,
      });
      if (res.ok) return true;
      if (res.status === 405) {
        const listRes = await this.signedFetch({
          method: 'GET',
          bucket: this.bucket,
          query: { 'list-type': '2', 'max-keys': '1' },
        });
        return listRes.ok;
      }
      return false;
    } catch {
      return false;
    }
  }
}

/**
 * Routes writes exclusively to the active configured provider while allowing reads/deletes
 * of un-migrated local objects during a rolling migration.
 */
export class RoutedMediaStorageAdapter implements MediaStorageAdapter {
  public readonly provider: MediaStorageProvider;
  public readonly bucket: string | null;

  constructor(
    private readonly primary: MediaStorageAdapter,
    private readonly localFallback: LocalMediaStorageAdapter
  ) {
    this.provider = primary.provider;
    this.bucket = primary.bucket;
  }

  private adapterForRef(ref: MediaObjectRef): MediaStorageAdapter {
    const targetProvider = ref.provider || this.primary.provider;
    if (targetProvider === this.primary.provider) {
      return this.primary;
    }
    if (targetProvider === 'local') {
      return this.localFallback;
    }
    throw new Error(
      `Media asset belongs to provider "${targetProvider}", but server is configured for "${this.primary.provider}".`
    );
  }

  putObject(input: PutMediaObjectInput): Promise<PutMediaObjectResult> {
    return this.primary.putObject(input);
  }

  headObject(ref: MediaObjectRef): Promise<MediaHeadResult> {
    return this.adapterForRef(ref).headObject(ref);
  }

  getObjectStream(ref: MediaObjectRef, range?: MediaReadRange): Promise<MediaReadResult | null> {
    return this.adapterForRef(ref).getObjectStream(ref, range);
  }

  deleteObject(ref: MediaObjectRef): Promise<void> {
    return this.adapterForRef(ref).deleteObject(ref);
  }

  healthCheck(): Promise<boolean> {
    return this.primary.healthCheck();
  }
}

export function resolveAdapterFromTarget(
  target: string | MediaStorageAdapter
): MediaStorageAdapter {
  if (typeof target === 'string') {
    return new LocalMediaStorageAdapter(target);
  }
  return target;
}

export function createMediaStorageAdapter(
  cfg: MediaStorageConfig,
  uploadsDir: string
): MediaStorageAdapter {
  if (cfg.provider === 'local') {
    return new LocalMediaStorageAdapter(uploadsDir);
  }

  if (!cfg.bucket || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.endpoint) {
    throw new Error(
      `MEDIA_STORAGE_PROVIDER=${cfg.provider} is missing required bucket/endpoint/credentials. Refusing to fall back to local storage.`
    );
  }

  return new S3CompatibleMediaStorageAdapter({
    provider: cfg.provider,
    bucket: cfg.bucket,
    region: cfg.region,
    endpoint: cfg.endpoint,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    forcePathStyle: cfg.forcePathStyle,
  });
}
