import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server';
import { loadConfig } from '../../server/config';
import { buildListingNormalizedColumns, tokenizeNormalizedQuery } from '../../server/db/arabicSearch';
import { createSeedData, hydrateStore } from '../../server/domain/marketplace';
import { prepareMigrationSnapshot } from '../../scripts/migrate-json-to-pg';
import { listingMatchesSearchQuery } from '../../src/lib/listing-search';

test('Phase 6B config enforces explicit STORAGE_BACKEND and refuses silent fallback on postgres misconfiguration', () => {
  const defaultCfg = loadConfig({});
  assert.equal(defaultCfg.storageBackend, 'json');

  const jsonCfg = loadConfig({ STORAGE_BACKEND: 'json' });
  assert.equal(jsonCfg.storageBackend, 'json');

  assert.throws(
    () => loadConfig({ STORAGE_BACKEND: 'sqlite' }),
    /Invalid STORAGE_BACKEND/
  );

  assert.throws(
    () => loadConfig({ STORAGE_BACKEND: 'postgres' }),
    /Refusing to fall back to JSON/
  );

  const pgCfg = loadConfig({
    STORAGE_BACKEND: 'postgres',
    DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/souq_test',
  });
  assert.equal(pgCfg.storageBackend, 'postgres');
  assert.equal(pgCfg.postgres?.connectionString, 'postgresql://user:pass@127.0.0.1:5432/souq_test');
});

test('Phase 6B startServer fails loudly when STORAGE_BACKEND=postgres cannot connect and never creates store.json fallback', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-pg-failfast-'));
  try {
    await assert.rejects(
      () =>
        startServer({
          serveFrontend: false,
          env: {
            PORT: '0',
            DATA_DIR: tmpDir,
            STORAGE_BACKEND: 'postgres',
            PGHOST: '127.0.0.1',
            PGPORT: '1',
            PGDATABASE: 'souq_unreachable',
            PGUSER: 'souq_app',
            PGPASSWORD: 'secret',
            PG_CONNECT_TIMEOUT_MS: '600',
          },
        }),
      /PostgreSQL startup verification failed/
    );

    assert.equal(fs.existsSync(path.join(tmpDir, 'store.json')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, '.store.lock')), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Phase 6B explicit STORAGE_BACKEND=json exposes healthy backend status on /api/v1/health', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-json-health-'));
  const srv = await startServer({
    serveFrontend: false,
    env: {
      PORT: '0',
      DATA_DIR: tmpDir,
      STORAGE_BACKEND: 'json',
    },
  });
  try {
    const res = await fetch(`http://127.0.0.1:${srv.port}/api/v1/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true, backend: 'json' });
    assert.equal(srv.backend, 'json');
  } finally {
    await srv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Phase 6B Arabic search normalization helper preserves parity across diacritics, alef/teh/yeh, tatweel, and Arabic numerals', () => {
  const cols = buildListingNormalizedColumns(
    {
      title: 'جَذْعَانْ نُعَيْمِيّ ١٠١ بلدي',
      description: 'مربى في المزرعة — حلال طيب',
      city: 'المزاحمية',
    },
    {
      breedName: 'نعيمي',
      categoryName: 'الأغنام',
      subCategoryName: 'ذبائح',
      regionName: 'الرياض',
      sellerDisplayName: 'مراح القحطاني',
    }
  );

  const tokens = tokenizeNormalizedQuery('جذعان نعيمى 101 المزاحميه القحطانى');
  assert.ok(tokens.length >= 4);
  for (const token of tokens) {
    assert.equal(cols.searchDoc.includes(token), true, `Expected token "${token}" in searchDoc`);
  }
  assert.equal(cols.cityNorm.includes('المزاحميه'), true);

  const sampleSeed = createSeedData();
  const l101 = sampleSeed.listings.find((l) => l.id === 'lst_101');
  assert.ok(l101);
  assert.equal(
    listingMatchesSearchQuery(l101, 'جذعان نعيمى المزاحميه', {
      breeds: sampleSeed.breeds,
      categories: sampleSeed.categories,
      regions: sampleSeed.regions,
      sellers: sampleSeed.sellers,
    }),
    true
  );
});

test('Phase 6B prepareMigrationSnapshot orders FK hierarchies (including child-before-parent comments), computes counts, and leaves input untouched', () => {
  const seed = hydrateStore(createSeedData());
  seed.credentials.push({
    userId: 'usr_buyer_1',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=1$salt$hashvalue1234567890',
    updatedAt: '2026-11-14T10:00:00Z',
  });
  seed.sessions.push({
    id: 'a'.repeat(64),
    userId: 'usr_buyer_1',
    createdAt: Date.now() - 10_000,
    lastSeenAt: Date.now(),
    expiresAt: Date.now() + 86_400_000,
    ip: '127.0.0.1',
    userAgent: 'node-test',
  });
  // Put a reply BEFORE its parent to verify topological ordering fixes parent-before-child FK order
  const childComment = seed.comments.find((c) => c.parentId !== null)!;
  const parentComment = seed.comments.find((c) => c.id === childComment.parentId)!;
  seed.comments = [childComment, parentComment];

  const serializedBefore = JSON.stringify(seed);
  const snapshot = prepareMigrationSnapshot(seed);
  assert.equal(JSON.stringify(seed), serializedBefore, 'Source store object must never be mutated');

  assert.equal(snapshot.counts.users, seed.users.length);
  assert.equal(snapshot.counts.user_credentials, 1);
  assert.equal(snapshot.counts.sessions, 1);
  assert.equal(snapshot.counts.categories, seed.categories.length);
  assert.equal(snapshot.counts.breeds, seed.breeds.length);
  assert.equal(snapshot.counts.regions, seed.regions.length);
  assert.equal(snapshot.counts.listings, seed.listings.length);
  assert.equal(snapshot.counts.conversations, seed.conversations.length);
  assert.equal(snapshot.counts.price_offers, seed.priceOffers.length);
  assert.equal(snapshot.counts.seller_reviews, seed.sellerReviews.length);
  assert.equal(snapshot.counts.reports, seed.reports.length);
  assert.equal(snapshot.counts.notifications, seed.notifications.length);
  assert.equal(snapshot.counts.audit_logs, seed.auditLogs.length);

  // Verify parent comment precedes child comment in prepared insert order
  const parentIdx = snapshot.commentRows.findIndex((c) => c.id === parentComment.id);
  const childIdx = snapshot.commentRows.findIndex((c) => c.id === childComment.id);
  assert.ok(parentIdx !== -1 && childIdx !== -1 && parentIdx < childIdx);

  // Verify listings have populated searchDoc, cityNorm, and accurate likesCount
  for (const row of snapshot.listingRows) {
    assert.ok(row.searchDoc && row.searchDoc.length > 5);
    assert.ok(row.cityNorm && row.cityNorm.length > 0);
  }
  const lst101 = snapshot.listingRows.find((l) => l.id === 'lst_101');
  assert.equal(lst101?.likesCount, 2);
});
