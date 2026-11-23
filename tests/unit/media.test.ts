import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {
  inspectMediaMagicBytes,
  MediaUploadError,
  parseMultipartBuffer,
  resolveSafeMediaPath,
  sanitizeOriginalName,
} from '../../server/media';

function makeJpeg(extra = 16): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(extra, 0xaa)]);
}

function makePng(extra = 16): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(extra, 0xbb),
  ]);
}

function makeWebp(extra = 16): Buffer {
  return Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP', 'ascii'),
    Buffer.alloc(extra, 0xcc),
  ]);
}

function makeMp4(brand = 'isom', extra = 16): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from(brand, 'ascii'),
    Buffer.alloc(extra, 0xdd),
  ]);
}

function makeWebm(extra = 16): Buffer {
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]),
    Buffer.from('webm', 'ascii'),
    Buffer.alloc(extra, 0xee),
  ]);
}

test('inspectMediaMagicBytes recognises JPEG, PNG, WebP, MP4, MOV, and WebM', () => {
  assert.deepEqual(inspectMediaMagicBytes(makeJpeg()), {
    kind: 'image',
    mimeType: 'image/jpeg',
    ext: 'jpg',
  });
  assert.deepEqual(inspectMediaMagicBytes(makePng()), {
    kind: 'image',
    mimeType: 'image/png',
    ext: 'png',
  });
  assert.deepEqual(inspectMediaMagicBytes(makeWebp()), {
    kind: 'image',
    mimeType: 'image/webp',
    ext: 'webp',
  });
  assert.deepEqual(inspectMediaMagicBytes(makeMp4('isom')), {
    kind: 'video',
    mimeType: 'video/mp4',
    ext: 'mp4',
  });
  assert.deepEqual(inspectMediaMagicBytes(makeMp4('qt  ')), {
    kind: 'video',
    mimeType: 'video/quicktime',
    ext: 'mov',
  });
  assert.deepEqual(inspectMediaMagicBytes(makeWebm()), {
    kind: 'video',
    mimeType: 'video/webm',
    ext: 'webm',
  });
});

test('inspectMediaMagicBytes rejects SVG, HTML, scripts, and truncated buffers', () => {
  assert.equal(inspectMediaMagicBytes(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(inspectMediaMagicBytes(Buffer.from('<!doctype html><script>alert(1)</script>')), null);
  assert.equal(inspectMediaMagicBytes(Buffer.from('short')), null);
  assert.equal(inspectMediaMagicBytes(makeMp4('evil')), null);
});

test('parseMultipartBuffer extracts binary file bytes, filename, and kind', () => {
  const boundary = '----SouqBoundary12345';
  const jpeg = makeJpeg(32);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nimage\r\n`),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="naimi.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
    ),
    jpeg,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const parsed = parseMultipartBuffer(body, boundary);
  assert.equal(parsed.expectedKind, 'image');
  assert.equal(parsed.filename, 'naimi.jpg');
  assert.equal(Buffer.compare(parsed.bytes, jpeg), 0);
});

test('parseMultipartBuffer rejects requests without a file part', () => {
  const boundary = '----SouqBoundaryEmpty';
  const body = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nimage\r\n--${boundary}--\r\n`
  );
  assert.throws(() => parseMultipartBuffer(body, boundary), MediaUploadError);
});

test('sanitizeOriginalName and resolveSafeMediaPath block path traversal', () => {
  assert.equal(sanitizeOriginalName('../../etc/passwd?bad*name.jpg', 'jpg'), 'passwdbadname.jpg');
  const uploadsDir = path.join(os.tmpdir(), 'souq-uploads-test');
  const safe = resolveSafeMediaPath(uploadsDir, 'med_0123456789abcdef.jpg');
  assert.equal(safe, path.resolve(uploadsDir, 'med_0123456789abcdef.jpg'));

  assert.throws(() => resolveSafeMediaPath(uploadsDir, '../store.json'), MediaUploadError);
  assert.throws(() => resolveSafeMediaPath(uploadsDir, 'med_123.svg'), MediaUploadError);
});
