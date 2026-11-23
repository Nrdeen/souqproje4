import crypto from 'node:crypto';
import fs from 'node:fs';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import {
  buildObjectKey,
  computeSha256Hex,
  resolveAssetObjectRef,
  type MediaStorageAdapter,
  type MediaStorageProvider,
} from './mediaStorage';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_UPLOAD_REQUEST_BYTES = 26 * 1024 * 1024; // 26 MB (video + multipart framing)
export const MAX_LISTING_IMAGES = 8;
export const MAX_LISTING_VIDEOS = 1;
export const MAX_UNBOUND_MEDIA_PER_USER = 30;

export type MediaKind = 'image' | 'video';

export interface MediaAsset {
  id: string;
  filename: string;
  url: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
  uploaderId: string;
  listingId: string | null;
  createdAt: string;
  storageProvider?: MediaStorageProvider;
  bucket?: string | null;
  objectKey?: string;
  sha256Hex?: string | null;
}

export interface DetectedMediaType {
  kind: MediaKind;
  mimeType: string;
  ext: 'jpg' | 'png' | 'webp' | 'mp4' | 'mov' | 'webm';
}

export class MediaUploadError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'invalid_media'
  ) {
    super(message);
    this.name = 'MediaUploadError';
  }
}

export function toPublicMedia(asset: MediaAsset) {
  return {
    id: asset.id,
    url: asset.url,
    kind: asset.kind,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    originalName: asset.originalName,
    createdAt: asset.createdAt,
  };
}

const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'hvc1',
  'M4V ',
  'M4VP',
  'msnv',
  '3gp4',
  '3gp5',
  '3gp6',
  '3gp7',
  'f4v ',
]);

/**
 * Determines media format strictly from file magic bytes (never client MIME type or filename).
 * Rejects SVG, HTML, scripts, and any unrecognised binary format.
 */
export function inspectMediaMagicBytes(buf: Buffer): DetectedMediaType | null {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { kind: 'image', mimeType: 'image/jpeg', ext: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { kind: 'image', mimeType: 'image/png', ext: 'png' };
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { kind: 'image', mimeType: 'image/webp', ext: 'webp' };
  }

  // ISO Base Media (MP4 / QuickTime MOV): size(4) + "ftyp" + major_brand(4)
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii');
    if (brand === 'qt  ') {
      return { kind: 'video', mimeType: 'video/quicktime', ext: 'mov' };
    }
    if (MP4_BRANDS.has(brand)) {
      return { kind: 'video', mimeType: 'video/mp4', ext: 'mp4' };
    }
  }

  // WebM: EBML header 1A 45 DF A3 and "webm" DocType within first 128 bytes
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    const headerWindow = buf.subarray(0, Math.min(buf.length, 128)).toString('latin1').toLowerCase();
    if (headerWindow.includes('webm')) {
      return { kind: 'video', mimeType: 'video/webm', ext: 'webm' };
    }
  }

  return null;
}

export function sanitizeOriginalName(raw: string | undefined, fallbackExt: string): string {
  const base = path.basename(String(raw || '').replace(/\\/g, '/')).replace(/[\u0000-\u001f<>:"/|?*]/g, '');
  const trimmed = base.trim().slice(0, 80);
  return trimmed || `upload.${fallbackExt}`;
}

export function resolveSafeMediaPath(uploadsDir: string, filename: string): string {
  if (!/^med_[a-f0-9-]+\.(jpg|png|webp|mp4|mov|webm)$/i.test(filename)) {
    throw new MediaUploadError(400, 'معرف الملف غير صالح');
  }
  const resolvedDir = path.resolve(uploadsDir);
  const resolved = path.resolve(resolvedDir, filename);
  if (!resolved.startsWith(resolvedDir + path.sep)) {
    throw new MediaUploadError(400, 'مسار الملف غير صالح');
  }
  return resolved;
}

export async function readBoundedBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const contentLengthHeader = req.headers['content-length'];
  if (contentLengthHeader) {
    const declared = Number(contentLengthHeader);
    if (Number.isFinite(declared) && declared > maxBytes) {
      req.resume();
      throw new MediaUploadError(413, 'حجم الملف يتجاوز الحد المسموح', 'payload_too_large');
    }
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAborted);
      reject(err);
    };

    const onData = (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
        req.pause();
        fail(new MediaUploadError(413, 'حجم الملف يتجاوز الحد المسموح', 'payload_too_large'));
        return;
      }
      chunks.push(buf);
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, total));
    };

    const onError = (err: Error) => fail(err);
    const onAborted = () => fail(new MediaUploadError(400, 'تم إلغاء رفع الملف قبل اكتماله'));

    req.on('data', onData);
    req.once('end', onEnd);
    req.once('error', onError);
    req.once('aborted', onAborted);
  });
}

export interface ParsedUpload {
  bytes: Buffer;
  filename?: string;
  expectedKind?: MediaKind;
}

function extractMultipartBoundary(contentType: string): string | null {
  const match = /;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  return match ? match[1] || match[2] || null : null;
}

export function parseMultipartBuffer(body: Buffer, boundary: string): ParsedUpload {
  const boundaryMarker = Buffer.from(`--${boundary}`);
  const headerSep = Buffer.from('\r\n\r\n');
  let offset = body.indexOf(boundaryMarker);
  if (offset === -1) {
    throw new MediaUploadError(400, 'تنسيق طلب الرفع غير صالح');
  }

  let fileBytes: Buffer | null = null;
  let filename: string | undefined;
  let expectedKind: MediaKind | undefined;

  while (offset !== -1) {
    const partStart = offset + boundaryMarker.length;
    // Closing boundary "--"
    if (body.subarray(partStart, partStart + 2).equals(Buffer.from('--'))) {
      break;
    }
    const contentStart = body[partStart] === 0x0d && body[partStart + 1] === 0x0a ? partStart + 2 : partStart;
    const nextBoundary = body.indexOf(boundaryMarker, contentStart);
    if (nextBoundary === -1) break;

    const headerEnd = body.indexOf(headerSep, contentStart);
    if (headerEnd === -1 || headerEnd > nextBoundary) {
      offset = nextBoundary;
      continue;
    }

    const headerText = body.subarray(contentStart, headerEnd).toString('utf-8');
    // Strip trailing \r\n before the next boundary marker
    let dataEnd = nextBoundary;
    if (dataEnd >= 2 && body[dataEnd - 2] === 0x0d && body[dataEnd - 1] === 0x0a) {
      dataEnd -= 2;
    }
    const partBody = body.subarray(headerEnd + headerSep.length, dataEnd);

    const dispMatch = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(headerText);
    const disp = dispMatch?.[1] || '';
    const nameMatch = /\bname="([^"]+)"/i.exec(disp);
    const fileMatch = /\bfilename="([^"]*)"/i.exec(disp);
    const fieldName = nameMatch?.[1] || '';

    if (fileMatch && (fieldName === 'file' || !fileBytes)) {
      fileBytes = partBody;
      filename = fileMatch[1];
    } else if (fieldName === 'kind') {
      const val = partBody.toString('utf-8').trim();
      if (val === 'image' || val === 'video') expectedKind = val;
    }

    offset = nextBoundary;
  }

  if (!fileBytes) {
    throw new MediaUploadError(400, 'لم يتم إرفاق أي ملف للرفع');
  }

  return { bytes: fileBytes, filename, expectedKind };
}

export async function parseUploadRequest(req: IncomingMessage): Promise<ParsedUpload> {
  const contentType = String(req.headers['content-type'] || '');
  const lowerCt = contentType.toLowerCase();

  if (lowerCt.startsWith('multipart/form-data')) {
    const boundary = extractMultipartBoundary(contentType);
    if (!boundary) {
      throw new MediaUploadError(400, 'تنسيق طلب الرفع غير صالح');
    }
    const raw = await readBoundedBody(req, MAX_UPLOAD_REQUEST_BYTES);
    return parseMultipartBuffer(raw, boundary);
  }

  if (
    lowerCt.startsWith('image/') ||
    lowerCt.startsWith('video/') ||
    lowerCt.startsWith('application/octet-stream')
  ) {
    const bytes = await readBoundedBody(req, MAX_VIDEO_BYTES);
    const kindHeader = String(req.headers['x-media-kind'] || '').trim();
    const expectedKind = kindHeader === 'image' || kindHeader === 'video' ? kindHeader : undefined;
    const rawFilename = req.headers['x-file-name'];
    const filename = typeof rawFilename === 'string' ? decodeURIComponentSafe(rawFilename) : undefined;
    return { bytes, filename, expectedKind };
  }

  throw new MediaUploadError(415, 'نوع الطلب غير مدعوم، يرجى رفع صورة أو فيديو صالح');
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function prepareUploadedMedia(params: {
  parsed: ParsedUpload;
  uploaderId: string;
  storageProvider?: MediaStorageProvider;
  bucket?: string | null;
  keyPrefix?: string;
}): { asset: MediaAsset; bytes: Buffer } {
  const {
    parsed,
    uploaderId,
    storageProvider = 'local',
    bucket = null,
    keyPrefix,
  } = params;

  if (!parsed.bytes || parsed.bytes.length === 0) {
    throw new MediaUploadError(400, 'الملف المرفوع فارغ');
  }

  const detected = inspectMediaMagicBytes(parsed.bytes);
  if (!detected) {
    throw new MediaUploadError(
      400,
      'صيغة الملف غير مدعومة. الصور المسموحة: JPG, PNG, WebP · الفيديو: MP4, MOV, WebM'
    );
  }

  if (parsed.expectedKind && detected.kind !== parsed.expectedKind) {
    throw new MediaUploadError(
      400,
      parsed.expectedKind === 'image'
        ? 'يرجى اختيار ملف صورة صالح (JPG, PNG, WebP)'
        : 'يرجى اختيار ملف فيديو صالح (MP4, MOV, WebM)'
    );
  }

  if (detected.kind === 'image' && parsed.bytes.length > MAX_IMAGE_BYTES) {
    throw new MediaUploadError(413, 'حجم الصورة يتجاوز الحد المسموح (5 ميجابايت)', 'file_too_large');
  }

  if (detected.kind === 'video' && parsed.bytes.length > MAX_VIDEO_BYTES) {
    throw new MediaUploadError(413, 'حجم الفيديو يتجاوز الحد المسموح (25 ميجابايت)', 'file_too_large');
  }

  const id = `med_${crypto.randomUUID().replace(/-/g, '')}`;
  const filename = `${id}.${detected.ext}`;
  const objectKey = buildObjectKey(filename, keyPrefix);
  const sha256Hex = computeSha256Hex(parsed.bytes);

  return {
    bytes: parsed.bytes,
    asset: {
      id,
      filename,
      url: `/api/v1/media/${id}`,
      kind: detected.kind,
      mimeType: detected.mimeType,
      sizeBytes: parsed.bytes.length,
      sha256Hex,
      storageProvider,
      bucket,
      objectKey,
      originalName: sanitizeOriginalName(parsed.filename, detected.ext),
      uploaderId,
      listingId: null,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function storeUploadedMediaWithAdapter(params: {
  adapter: MediaStorageAdapter;
  keyPrefix?: string;
  parsed: ParsedUpload;
  uploaderId: string;
}): Promise<MediaAsset> {
  const { adapter, keyPrefix, parsed, uploaderId } = params;
  const prepared = prepareUploadedMedia({
    parsed,
    uploaderId,
    storageProvider: adapter.provider,
    bucket: adapter.bucket,
    keyPrefix,
  });

  const stored = await adapter.putObject({
    objectKey: prepared.asset.objectKey!,
    bytes: prepared.bytes,
    mimeType: prepared.asset.mimeType,
    sha256Hex: prepared.asset.sha256Hex!,
    metadata: {
      'media-id': prepared.asset.id,
      'uploader-id': uploaderId,
    },
  });

  return {
    ...prepared.asset,
    storageProvider: stored.provider,
    bucket: stored.bucket,
    objectKey: stored.objectKey,
    sha256Hex: stored.sha256Hex,
  };
}

export function storeUploadedMedia(params: {
  uploadsDir: string;
  parsed: ParsedUpload;
  uploaderId: string;
}): MediaAsset {
  const { uploadsDir, parsed, uploaderId } = params;
  const prepared = prepareUploadedMedia({
    parsed,
    uploaderId,
    storageProvider: 'local',
    bucket: null,
  });

  fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o700 });
  const targetPath = resolveSafeMediaPath(uploadsDir, prepared.asset.filename);
  fs.writeFileSync(targetPath, prepared.bytes, { mode: 0o600 });

  return prepared.asset;
}

export function removeMediaFile(uploadsDir: string, filename: string): void {
  try {
    const safePath = resolveSafeMediaPath(uploadsDir, filename);
    fs.rmSync(safePath, { force: true });
  } catch {
    // ignore missing or invalid file during cleanup
  }
}

export interface ListingImageRecord {
  id: string;
  url: string;
  position: number;
  mediaId?: string;
}

export interface ListingVideoRecord {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  mediaId: string;
  originalName?: string;
}

const STOCK_IMAGE_PATH_RE = /^\/src\/assets\/images\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/;
const UPLOADED_MEDIA_URL_RE = /^\/api\/v1\/media\/(med_[a-f0-9]+)$/;

export function extractMediaIdFromUrl(url: string): string | null {
  const match = UPLOADED_MEDIA_URL_RE.exec(String(url || '').trim());
  return match ? match[1] : null;
}

/**
 * Validates all image and video references attached to a listing creation or update,
 * guaranteeing that a seller can only attach their own uploaded media (or built-in stock assets).
 */
export function resolveListingMedia(params: {
  actorId: string;
  actorIsAdmin: boolean;
  targetListingId: string;
  mediaStore: MediaAsset[];
  imageInputs?: unknown;
  videoInput?: unknown;
  fallbackImageUrl: string;
}): {
  images: ListingImageRecord[];
  video: ListingVideoRecord | null;
  boundMediaIds: Set<string>;
} {
  const { actorId, actorIsAdmin, targetListingId, mediaStore, imageInputs, videoInput, fallbackImageUrl } = params;
  const boundMediaIds = new Set<string>();
  const images: ListingImageRecord[] = [];

  if (Array.isArray(imageInputs) && imageInputs.length > 0) {
    if (imageInputs.length > MAX_LISTING_IMAGES) {
      throw new MediaUploadError(400, `الحد الأقصى للصور هو ${MAX_LISTING_IMAGES} صور لكل إعلان`);
    }

    for (const entry of imageInputs) {
      const rawUrl = typeof entry === 'string' ? entry.trim() : typeof (entry as any)?.url === 'string' ? String((entry as any).url).trim() : '';
      const rawMediaId = typeof (entry as any)?.mediaId === 'string' ? String((entry as any).mediaId).trim() : extractMediaIdFromUrl(rawUrl);

      if (rawMediaId) {
        const asset = mediaStore.find((m) => m.id === rawMediaId);
        if (!asset || asset.kind !== 'image') {
          throw new MediaUploadError(400, 'إحدى الصور المرفوعة غير موجودة أو غير صالحة');
        }
        if (!actorIsAdmin && asset.uploaderId !== actorId) {
          throw new MediaUploadError(403, 'غير مصرح لك باستخدام ملف مرفوع لحساب آخر', 'forbidden');
        }
        if (asset.listingId !== null && asset.listingId !== targetListingId) {
          throw new MediaUploadError(403, 'هذا الملف مرتبط بإعلان آخر بالفعل', 'forbidden');
        }
        if (boundMediaIds.has(asset.id)) {
          continue;
        }
        boundMediaIds.add(asset.id);
        images.push({
          id: `img_${crypto.randomUUID().slice(0, 6)}`,
          url: asset.url,
          position: images.length + 1,
          mediaId: asset.id,
        });
      } else if (STOCK_IMAGE_PATH_RE.test(rawUrl)) {
        images.push({
          id: `img_${crypto.randomUUID().slice(0, 6)}`,
          url: rawUrl,
          position: images.length + 1,
        });
      } else {
        throw new MediaUploadError(400, 'رابط الصورة غير صالح أو غير مسموح به');
      }
    }
  } else {
    images.push({
      id: `img_${crypto.randomUUID().slice(0, 6)}`,
      url: fallbackImageUrl,
      position: 1,
    });
  }

  let video: ListingVideoRecord | null = null;
  if (videoInput !== undefined && videoInput !== null && videoInput !== '') {
    const rawVideoId =
      typeof videoInput === 'string'
        ? extractMediaIdFromUrl(videoInput) || videoInput.trim()
        : typeof (videoInput as any)?.mediaId === 'string'
        ? String((videoInput as any).mediaId).trim()
        : typeof (videoInput as any)?.url === 'string'
        ? extractMediaIdFromUrl(String((videoInput as any).url))
        : null;

    if (!rawVideoId) {
      throw new MediaUploadError(400, 'بيانات الفيديو المرفق غير صالحة');
    }

    const asset = mediaStore.find((m) => m.id === rawVideoId);
    if (!asset || asset.kind !== 'video') {
      throw new MediaUploadError(400, 'ملف الفيديو غير موجود أو غير صالح');
    }
    if (!actorIsAdmin && asset.uploaderId !== actorId) {
      throw new MediaUploadError(403, 'غير مصرح لك باستخدام فيديو مرفوع لحساب آخر', 'forbidden');
    }
    if (asset.listingId !== null && asset.listingId !== targetListingId) {
      throw new MediaUploadError(403, 'هذا الفيديو مرتبط بإعلان آخر بالفعل', 'forbidden');
    }

    boundMediaIds.add(asset.id);
    video = {
      id: `vid_${crypto.randomUUID().slice(0, 6)}`,
      url: asset.url,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      mediaId: asset.id,
      originalName: asset.originalName,
    };
  }

  return { images, video, boundMediaIds };
}

/**
 * Collects all uploaded media IDs referenced by any listing's images or video.
 */
export function collectReferencedMediaIds(
  listings: Array<{ images?: any[]; video?: any }>
): Set<string> {
  const referenced = new Set<string>();
  for (const listing of listings || []) {
    if (Array.isArray(listing.images)) {
      for (const img of listing.images) {
        const directId = typeof img?.mediaId === 'string' ? img.mediaId.trim() : '';
        const urlId = typeof img?.url === 'string' ? extractMediaIdFromUrl(img.url) : null;
        if (directId) referenced.add(directId);
        if (urlId) referenced.add(urlId);
      }
    }
    if (listing.video) {
      const directVidId =
        typeof listing.video?.mediaId === 'string' ? listing.video.mediaId.trim() : '';
      const urlVidId =
        typeof listing.video?.url === 'string' ? extractMediaIdFromUrl(listing.video.url) : null;
      if (directVidId) referenced.add(directVidId);
      if (urlVidId) referenced.add(urlVidId);
    }
  }
  return referenced;
}

/**
 * Safely sweeps expired, unbound draft uploads older than `ttlMs`, removing both store metadata
 * and physical files on disk while protecting active listing media and in-flight submissions.
 */
export function cleanupOrphanedDraftMedia(params: {
  uploadsDir: string;
  mediaStore: MediaAsset[];
  listings: Array<{ id: string; images?: any[]; video?: any }>;
  ttlMs: number;
  nowMs?: number;
  protectedMediaIds?: Set<string>;
}): { removedIds: string[]; mediaStore: MediaAsset[] } {
  const {
    uploadsDir,
    mediaStore,
    listings,
    ttlMs,
    nowMs = Date.now(),
    protectedMediaIds,
  } = params;

  const referencedIds = collectReferencedMediaIds(listings);
  const activeListingIds = new Set(listings.map((l) => l.id));
  const kept: MediaAsset[] = [];
  const removedIds: string[] = [];

  for (const asset of mediaStore || []) {
    const isProtected = Boolean(protectedMediaIds?.has(asset.id));
    const isReferencedByListing = referencedIds.has(asset.id);
    const isBoundToExistingListing =
      asset.listingId !== null && activeListingIds.has(asset.listingId);

    if (isProtected || isReferencedByListing || isBoundToExistingListing) {
      kept.push(asset);
      continue;
    }

    const createdMs = new Date(asset.createdAt).getTime();
    const isExpired = Number.isFinite(createdMs) ? nowMs - createdMs >= ttlMs : false;
    if (!isExpired) {
      kept.push(asset);
      continue;
    }

    removeMediaFile(uploadsDir, asset.filename);
    removedIds.push(asset.id);
  }

  return { removedIds, mediaStore: kept };
}

/**
 * Adapter-backed async variant of orphaned draft media cleanup supporting local and cloud storage.
 */
export async function cleanupOrphanedDraftMediaAsync(params: {
  storage: MediaStorageAdapter;
  mediaStore: MediaAsset[];
  listings: Array<{ id: string; images?: any[]; video?: any }>;
  ttlMs: number;
  nowMs?: number;
  protectedMediaIds?: Set<string>;
}): Promise<{ removedIds: string[]; mediaStore: MediaAsset[] }> {
  const {
    storage,
    mediaStore,
    listings,
    ttlMs,
    nowMs = Date.now(),
    protectedMediaIds,
  } = params;

  const referencedIds = collectReferencedMediaIds(listings);
  const activeListingIds = new Set(listings.map((l) => l.id));
  const kept: MediaAsset[] = [];
  const removedIds: string[] = [];

  for (const asset of mediaStore || []) {
    const isProtected = Boolean(protectedMediaIds?.has(asset.id));
    const isReferencedByListing = referencedIds.has(asset.id);
    const isBoundToExistingListing =
      asset.listingId !== null && activeListingIds.has(asset.listingId);

    if (isProtected || isReferencedByListing || isBoundToExistingListing) {
      kept.push(asset);
      continue;
    }

    const createdMs = new Date(asset.createdAt).getTime();
    const isExpired = Number.isFinite(createdMs) ? nowMs - createdMs >= ttlMs : false;
    if (!isExpired) {
      kept.push(asset);
      continue;
    }

    try {
      await storage.deleteObject(resolveAssetObjectRef(asset));
    } catch (err) {
      console.error(`[media] Failed to delete orphaned media object ${asset.id}:`, err);
    }
    removedIds.push(asset.id);
  }

  return { removedIds, mediaStore: kept };
}

