import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareReferenceCatalogSnapshot } from '../../scripts/seed-reference-catalog';
import { startServer } from '../../server';
import { createSeedData } from '../../server/domain/marketplace';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

test('Phase 6D index.html contains no inline scripts and /public/theme-init.js exists', () => {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(indexHtml, /<script src="\/theme-init\.js"><\/script>/);
  const inlineScripts = [...indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/gi)];
  assert.equal(
    inlineScripts.length,
    0,
    'index.html must not contain inline <script> tags so production script-src self CSP stays strict'
  );

  const themeInit = fs.readFileSync(path.join(ROOT, 'public', 'theme-init.js'), 'utf8');
  assert.match(themeInit, /souq-theme/);
  assert.match(themeInit, /prefers-color-scheme: dark/);
});

test('Phase 6D deployment artifacts exist and contain no leaked secrets', () => {
  const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /HEALTHCHECK[\s\S]*\/api\/v1\/live/);
  assert.match(dockerfile, /USER node/);

  const dockerignore = fs.readFileSync(path.join(ROOT, '.dockerignore'), 'utf8');
  assert.match(dockerignore, /^\.env$/m);
  assert.match(dockerignore, /^data$/m);

  const prodEnv = fs.readFileSync(path.join(ROOT, '.env.production.example'), 'utf8');
  assert.match(prodEnv, /STORAGE_BACKEND="postgres"/);
  assert.match(prodEnv, /PG_SSL_MODE="verify-full"/);
  assert.match(prodEnv, /REPLACE_WITH_/);

  const nginxConf = fs.readFileSync(path.join(ROOT, 'deploy', 'nginx.conf.example'), 'utf8');
  assert.match(nginxConf, /location = \/ws/);
  assert.match(nginxConf, /proxy_buffering off;/);
  assert.match(nginxConf, /client_max_body_size 30m;/);
});

test('Phase 6D production mode enforces strict security headers, pre-auth live/health/ready probes, and HTTP keepAlive settings', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-p6d-'));
  const distDir = path.join(ROOT, 'dist');
  const hadDistBefore = fs.existsSync(distDir);
  // Ensure dist/index.html exists only if not built yet? Keep serveFrontend: false for isolated HTTP header & probe test.
  const srv = await startServer({
    serveFrontend: false,
    env: {
      PORT: '0',
      NODE_ENV: 'production',
      APP_URL: 'https://souq.example.sa',
      SESSION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef',
      TRUST_PROXY: '1',
      DATA_DIR: tmpDir,
      STORAGE_BACKEND: 'json',
    },
  });

  try {
    assert.ok(srv.httpServer.keepAliveTimeout >= 65_000, 'keepAliveTimeout must exceed 60s proxy window');
    assert.ok(srv.httpServer.headersTimeout > srv.httpServer.keepAliveTimeout);

    const [liveRes, healthRes, readyRes] = await Promise.all([
      fetch(`http://127.0.0.1:${srv.port}/api/v1/live`),
      fetch(`http://127.0.0.1:${srv.port}/api/v1/health`),
      fetch(`http://127.0.0.1:${srv.port}/api/v1/ready`),
    ]);

    assert.equal(liveRes.status, 200);
    const liveBody = (await liveRes.json()) as { ok: boolean; status: string };
    assert.equal(liveBody.ok, true);
    assert.equal(liveBody.status, 'live');

    assert.equal(healthRes.status, 200);
    assert.deepEqual(await healthRes.json(), { ok: true, backend: 'json' });

    assert.equal(readyRes.status, 200);
    const readyBody = (await readyRes.json()) as {
      ok: boolean;
      status: string;
      backend: string;
      mediaProvider: string;
      checks: { database: boolean; mediaStorage: boolean };
    };
    assert.equal(readyBody.ok, true);
    assert.equal(readyBody.status, 'ready');
    assert.equal(readyBody.backend, 'json');
    assert.equal(readyBody.mediaProvider, 'local');
    assert.deepEqual(readyBody.checks, { database: true, mediaStorage: true });

    // Strict production CSP and Permissions-Policy headers
    const csp = readyRes.headers.get('content-security-policy') || '';
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.equal(readyRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(readyRes.headers.get('x-frame-options'), 'DENY');
    assert.ok(readyRes.headers.get('strict-transport-security'));
    assert.ok(readyRes.headers.get('permissions-policy'));
    assert.equal(readyRes.headers.get('cache-control'), 'no-store');
    assert.equal(hadDistBefore || true, true);
  } finally {
    await srv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Pre-staging prepareReferenceCatalogSnapshot extracts only canonical reference catalog with valid FKs and parent-first order', () => {
  const seed = createSeedData();
  const snapshot = prepareReferenceCatalogSnapshot();

  assert.equal(snapshot.counts.regions, seed.regions.length);
  assert.equal(snapshot.counts.categories, seed.categories.length);
  assert.equal(snapshot.counts.breeds, seed.breeds.length);
  assert.equal(snapshot.counts.indicative_prices, seed.indicativePrices.length);
  assert.equal(snapshot.counts.articles, seed.articles.length);
  assert.equal(snapshot.counts.faqs, seed.faqs.length);

  // Verify every subcategory appears strictly after its parent category
  const seenCatIds = new Set<string>();
  for (const cat of snapshot.categoryRows) {
    if (cat.parentId) {
      assert.ok(seenCatIds.has(cat.parentId), `Parent category ${cat.parentId} must precede ${cat.id}`);
    }
    seenCatIds.add(cat.id);
  }

  // Verify breed -> category and indicativePrice -> breed FKs
  const breedIds = new Set(snapshot.breedRows.map((b) => b.id));
  for (const breed of snapshot.breedRows) {
    assert.ok(seenCatIds.has(breed.categoryId));
  }
  for (const price of snapshot.indicativePriceRows) {
    assert.ok(breedIds.has(price.breedId));
  }
});
