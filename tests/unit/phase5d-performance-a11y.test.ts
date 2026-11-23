import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveMarketplaceWebp, stepLightboxIndex } from '../../src/lib/modal-focus';
import { appendAuditArchive, AUDIT_ARCHIVE_FILE_NAME, StorePersister } from '../../server/storage';

test('stepLightboxIndex navigates RTL carousel/lightbox wrap-around safely', () => {
  assert.equal(stepLightboxIndex(0, 4, 'next'), 1);
  assert.equal(stepLightboxIndex(3, 4, 'next'), 0);
  assert.equal(stepLightboxIndex(0, 4, 'prev'), 3);
  assert.equal(stepLightboxIndex(2, 4, 'prev'), 1);
  assert.equal(stepLightboxIndex(0, 1, 'next'), 0);
  assert.equal(stepLightboxIndex(0, 0, 'prev'), 0);
  assert.equal(stepLightboxIndex(-1, 3, 'next'), 0);
});

test('resolveMarketplaceWebp maps local marketplace JPGs to WebP without altering user uploads', () => {
  assert.equal(
    resolveMarketplaceWebp('/src/assets/images/hero_saudi_livestock_1794608168927.jpg'),
    '/src/assets/images/hero_saudi_livestock_1794608168927.webp'
  );
  assert.equal(
    resolveMarketplaceWebp('/src/assets/images/breed_naimi_sheep_1794608169331.jpg?v=1'),
    '/src/assets/images/breed_naimi_sheep_1794608169331.webp?v=1'
  );
  assert.equal(resolveMarketplaceWebp('/api/v1/media/usr_1/photo.jpg'), null);
  assert.equal(resolveMarketplaceWebp('https://example.com/sheep.jpg'), null);
});

test('optimized marketplace images exist as paired JPG and WebP files under 200 KB each', () => {
  const imagesDir = path.resolve(process.cwd(), 'src/assets/images');
  const files = fs.readdirSync(imagesDir);
  const jpgs = files.filter((f) => f.endsWith('.jpg'));
  assert.ok(jpgs.length >= 6, `Expected >= 6 marketplace JPGs, got ${jpgs.length}`);

  for (const jpg of jpgs) {
    const webp = jpg.replace(/\.jpg$/i, '.webp');
    assert.ok(files.includes(webp), `Missing sibling WebP asset for ${jpg}`);
    const jpgSize = fs.statSync(path.join(imagesDir, jpg)).size;
    const webpSize = fs.statSync(path.join(imagesDir, webp)).size;
    assert.ok(jpgSize > 0 && jpgSize < 200_000, `${jpg} size unexpected: ${jpgSize}`);
    assert.ok(webpSize > 0 && webpSize < 200_000, `${webp} size unexpected: ${webpSize}`);
    assert.ok(webpSize < jpgSize, `Expected ${webp} (${webpSize}) < ${jpg} (${jpgSize})`);
  }
});

test('Phase 5D code splitting, Vite build config, and accessibility architecture invariants hold', () => {
  const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.match(appSrc, /const ListingsDirectory = lazy\(/);

  const dashboardSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/DashboardView.tsx'),
    'utf8'
  );
  assert.match(dashboardSrc, /const AdminDashboardPanel = lazy\(/);
  assert.match(dashboardSrc, /<Suspense fallback=\{<AdminPanelFallback \/>\}>/);

  const detailSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ListingDetailView.tsx'),
    'utf8'
  );
  assert.match(detailSrc, /import \{ ImageLightbox \} from '\.\/ImageLightbox'/);
  assert.match(detailSrc, /<ImageLightbox[\s\S]*returnFocusRef=\{zoomBtnRef\}/);

  const lightboxSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ImageLightbox.tsx'),
    'utf8'
  );
  assert.match(lightboxSrc, /role="dialog"/);
  assert.match(lightboxSrc, /aria-modal="true"/);
  assert.match(lightboxSrc, /aria-live="polite"/);
  assert.match(lightboxSrc, /MODAL_FOCUSABLE_SELECTOR/);
  assert.match(lightboxSrc, /getFocusTrapTargetIndex/);
  assert.match(lightboxSrc, /document\.body\.style\.overflow = 'hidden'/);

  const viteSrc = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8');
  assert.doesNotMatch(viteSrc, /chunkSizeWarningLimit/);
  assert.match(viteSrc, /copyMarketplaceImagesPlugin/);
  assert.match(viteSrc, /manualChunks/);

  const cssSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
  assert.match(cssSrc, /prefers-reduced-motion:\s*reduce/);
});

test('StorePersister coalesces scheduled saves, flushes atomically, and archives audit logs non-destructively', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-persister-'));
  try {
    const storePath = path.join(dir, 'store.json');
    const state = { count: 0, items: ['init'] };

    const persister = new StorePersister<{ count: number; items: string[] }>(dir, storePath, 80);

    state.count = 1;
    persister.scheduleSave(() => ({ ...state }));
    state.count = 2;
    persister.scheduleSave(() => ({ ...state }));
    state.count = 3;
    persister.scheduleSave(() => ({ ...state }));

    assert.equal(persister.hasPendingWrites(), true);
    assert.equal(fs.existsSync(storePath), false);

    persister.flushSync();
    assert.equal(persister.hasPendingWrites(), false);
    assert.equal(fs.existsSync(storePath), true);
    const saved = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    assert.equal(saved.count, 3);

    // Save immediate writes synchronously and cancels pending coalesced write
    state.count = 10;
    persister.scheduleSave(() => ({ ...state }));
    state.count = 11;
    persister.saveImmediate({ ...state });
    assert.equal(persister.hasPendingWrites(), false);
    assert.equal(JSON.parse(fs.readFileSync(storePath, 'utf8')).count, 11);

    // Audit archival appends NDJSON batches without overwriting earlier records
    appendAuditArchive(dir, [{ id: 'aud_1', action: 'test_1' }]);
    appendAuditArchive(dir, [{ id: 'aud_2', action: 'test_2' }]);
    const archiveLines = fs
      .readFileSync(path.join(dir, AUDIT_ARCHIVE_FILE_NAME), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      archiveLines.map((x) => x.id),
      ['aud_1', 'aud_2']
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
