/**
 * Safe, idempotent reference-catalog seed utility for fresh PostgreSQL databases.
 *
 * Populates ONLY canonical marketplace reference tables from `createSeedData()`:
 *   - regions
 *   - categories (root categories & smart subcategories, parent-first)
 *   - breeds
 *   - indicative_prices
 *   - articles
 *   - faqs
 *
 * Safety guarantees:
 * - Never creates demo users, demo seller profiles, demo listings, or credentials.
 * - Never overwrites existing production records (`ON CONFLICT DO NOTHING`).
 * - Validates all parent/foreign-key relationships before inserting.
 * - Executes inside one PostgreSQL transaction (`--dry-run` rolls back cleanly).
 *
 * Usage:
 *   npm run db:seed-catalog -- --preflight-only
 *   npm run db:seed-catalog -- --dry-run
 *   npm run db:seed-catalog
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePostgresConfigFromEnv } from '../server/config';
import { createDb, createPgPool, verifyDatabaseStartup, type AppDatabase } from '../server/db/client';
import {
  articles,
  breeds,
  categories,
  faqs,
  indicativePrices,
  regions,
} from '../server/db/schema';
import { createSeedData } from '../server/domain/marketplace';
import { loadEnvForEntryPoint } from '../server/env';

const __filename = fileURLToPath(import.meta.url);

class DryRunRollbackSignal extends Error {
  constructor() {
    super('DRY_RUN_ROLLBACK');
  }
}

export type CatalogTableKey =
  | 'regions'
  | 'categories'
  | 'breeds'
  | 'indicative_prices'
  | 'articles'
  | 'faqs';

export interface ReferenceCatalogSnapshot {
  counts: Record<CatalogTableKey, number>;
  regionRows: Array<typeof regions.$inferInsert>;
  categoryRows: Array<typeof categories.$inferInsert>;
  breedRows: Array<typeof breeds.$inferInsert>;
  indicativePriceRows: Array<typeof indicativePrices.$inferInsert>;
  articleRows: Array<typeof articles.$inferInsert>;
  faqRows: Array<typeof faqs.$inferInsert>;
}

export interface CatalogSeedTableResult {
  planned: number;
  inserted: number;
  skipped: number;
}

export interface SeedReferenceCatalogResult {
  committed: boolean;
  dryRun: boolean;
  tables: Record<CatalogTableKey, CatalogSeedTableResult>;
}

function toDate(value: string | number | Date | null | undefined, fallback = new Date()): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  return fallback;
}

function topologicalSortStrict<T extends { id: string; parentId?: string | null }>(
  items: T[],
  label: string
): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    const id = String(item.id || '').trim();
    if (!id) {
      throw new Error(`${label}: encountered record with empty id.`);
    }
    if (byId.has(id)) {
      throw new Error(`${label}: duplicate id "${id}" in canonical seed data.`);
    }
    byId.set(id, item);
  }

  const sorted: T[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (item: T) => {
    const current = state.get(item.id);
    if (current === 'done') return;
    if (current === 'visiting') {
      throw new Error(`${label}: cycle detected at id="${item.id}".`);
    }
    state.set(item.id, 'visiting');
    if (item.parentId) {
      const parent = byId.get(item.parentId);
      if (!parent) {
        throw new Error(
          `${label}: record "${item.id}" references missing parentId "${item.parentId}".`
        );
      }
      visit(parent);
    }
    state.set(item.id, 'done');
    sorted.push(item);
  };

  for (const item of items) visit(item);
  return sorted;
}

/**
 * Pure reference-catalog planner using canonical `createSeedData()`.
 * Strictly validates parent/FK integrity and never extracts user, seller, or listing records.
 */
export function prepareReferenceCatalogSnapshot(): ReferenceCatalogSnapshot {
  const seed = createSeedData();

  const orderedRegions = topologicalSortStrict(seed.regions || [], 'regions');
  const regionRows: Array<typeof regions.$inferInsert> = orderedRegions.map((r, index) => ({
    id: String(r.id),
    name: String(r.name).slice(0, 100),
    parentId: r.parentId ? String(r.parentId) : null,
    sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : index,
  }));

  const orderedCategories = topologicalSortStrict(seed.categories || [], 'categories');
  const categoryIds = new Set(orderedCategories.map((c) => String(c.id)));
  const categoryRows: Array<typeof categories.$inferInsert> = orderedCategories.map((c, index) => ({
    id: String(c.id),
    name: String(c.name).slice(0, 80),
    slug: String(c.slug || c.id).slice(0, 100),
    parentId: c.parentId ? String(c.parentId) : null,
    description: String(c.description || ''),
    keywords: Array.isArray(c.keywords) ? c.keywords.map(String) : [],
    sortOrder: typeof c.sortOrder === 'number' ? c.sortOrder : index,
  }));

  const breedIds = new Set<string>();
  const breedRows: Array<typeof breeds.$inferInsert> = [];
  for (const b of seed.breeds || []) {
    const id = String(b.id || '').trim();
    const categoryId = String(b.categoryId || '').trim();
    if (!id) throw new Error('breeds: encountered breed with empty id.');
    if (breedIds.has(id)) throw new Error(`breeds: duplicate id "${id}".`);
    if (!categoryIds.has(categoryId)) {
      throw new Error(`breeds: "${id}" references unknown categoryId "${categoryId}".`);
    }
    breedIds.add(id);
    breedRows.push({
      id,
      categoryId,
      name: String(b.name).slice(0, 80),
      slug: String(b.slug || id).slice(0, 100),
      origin: String(b.origin || 'المملكة العربية السعودية').slice(0, 120),
      summary: String(b.summary || ''),
      avgWeightKg: String(b.avgWeightKg || '').slice(0, 60),
      priceRangeSar: String(b.priceRangeSar || '').slice(0, 60),
      imageUrl: String(b.imageUrl || ''),
      characteristics: Array.isArray(b.characteristics) ? b.characteristics.map(String) : [],
    });
  }

  const priceIds = new Set<string>();
  const indicativePriceRows: Array<typeof indicativePrices.$inferInsert> = [];
  for (const p of seed.indicativePrices || []) {
    const id = String(p.id || '').trim();
    const breedId = String(p.breedId || '').trim();
    if (!id) throw new Error('indicative_prices: encountered record with empty id.');
    if (priceIds.has(id)) throw new Error(`indicative_prices: duplicate id "${id}".`);
    if (!breedIds.has(breedId)) {
      throw new Error(`indicative_prices: "${id}" references unknown breedId "${breedId}".`);
    }

    const minPrice = Number(p.minPrice);
    const maxPrice = Number(p.maxPrice);
    const avgPrice = Number(p.avgPrice);
    if (
      !Number.isFinite(minPrice) ||
      !Number.isFinite(maxPrice) ||
      !Number.isFinite(avgPrice) ||
      minPrice < 0 ||
      maxPrice < minPrice ||
      avgPrice < minPrice ||
      avgPrice > maxPrice
    ) {
      throw new Error(`indicative_prices: "${id}" violates price range check constraints.`);
    }
    if (p.trend !== 'up' && p.trend !== 'down' && p.trend !== 'stable') {
      throw new Error(`indicative_prices: "${id}" has invalid trend "${String(p.trend)}".`);
    }

    priceIds.add(id);
    indicativePriceRows.push({
      id,
      breedId,
      breedName: String(p.breedName).slice(0, 100),
      categoryName: String(p.categoryName).slice(0, 80),
      ageGroup: String(p.ageGroup).slice(0, 100),
      minPrice: String(minPrice),
      maxPrice: String(maxPrice),
      avgPrice: String(avgPrice),
      trend: p.trend,
      regionNote: String(p.regionNote || '').slice(0, 160),
      updatedAt: toDate(p.updatedAt),
    });
  }

  const articleIds = new Set<string>();
  const articleRows: Array<typeof articles.$inferInsert> = (seed.articles || []).map((a) => {
    const id = String(a.id || '').trim();
    if (!id) throw new Error('articles: encountered record with empty id.');
    if (articleIds.has(id)) throw new Error(`articles: duplicate id "${id}".`);
    articleIds.add(id);
    const readTimeMinutes = Number(a.readTimeMinutes || 0);
    if (!Number.isInteger(readTimeMinutes) || readTimeMinutes <= 0) {
      throw new Error(`articles: "${id}" must have positive readTimeMinutes.`);
    }
    return {
      id,
      title: String(a.title).slice(0, 200),
      category: String(a.category).slice(0, 80),
      readTimeMinutes,
      publishedAt: toDate(a.publishedAt),
      excerpt: String(a.excerpt || ''),
      content: String(a.content || ''),
      imageUrl: String(a.imageUrl || ''),
    };
  });

  const faqIds = new Set<string>();
  const faqRows: Array<typeof faqs.$inferInsert> = (seed.faqs || []).map((f, index) => {
    const id = String(f.id || '').trim();
    if (!id) throw new Error('faqs: encountered record with empty id.');
    if (faqIds.has(id)) throw new Error(`faqs: duplicate id "${id}".`);
    faqIds.add(id);
    return {
      id,
      question: String(f.question),
      answer: String(f.answer),
      sortOrder: typeof f.sortOrder === 'number' ? f.sortOrder : index,
    };
  });

  return {
    counts: {
      regions: regionRows.length,
      categories: categoryRows.length,
      breeds: breedRows.length,
      indicative_prices: indicativePriceRows.length,
      articles: articleRows.length,
      faqs: faqRows.length,
    },
    regionRows,
    categoryRows,
    breedRows,
    indicativePriceRows,
    articleRows,
    faqRows,
  };
}

/**
 * Idempotently inserts missing reference catalog rows into PostgreSQL without touching existing records.
 */
export async function seedReferenceCatalog(
  db: AppDatabase,
  snapshot: ReferenceCatalogSnapshot = prepareReferenceCatalogSnapshot(),
  opts: { dryRun?: boolean } = {}
): Promise<SeedReferenceCatalogResult> {
  const dryRun = Boolean(opts.dryRun);
  const tables: Record<CatalogTableKey, CatalogSeedTableResult> = {
    regions: { planned: snapshot.regionRows.length, inserted: 0, skipped: 0 },
    categories: { planned: snapshot.categoryRows.length, inserted: 0, skipped: 0 },
    breeds: { planned: snapshot.breedRows.length, inserted: 0, skipped: 0 },
    indicative_prices: { planned: snapshot.indicativePriceRows.length, inserted: 0, skipped: 0 },
    articles: { planned: snapshot.articleRows.length, inserted: 0, skipped: 0 },
    faqs: { planned: snapshot.faqRows.length, inserted: 0, skipped: 0 },
  };

  let committed = false;

  try {
    await db.transaction(async (tx) => {
      for (const row of snapshot.regionRows) {
        const res = await tx
          .insert(regions)
          .values(row)
          .onConflictDoNothing()
          .returning({ id: regions.id });
        if (res.length > 0) tables.regions.inserted += 1;
        else tables.regions.skipped += 1;
      }

      for (const row of snapshot.categoryRows) {
        const res = await tx
          .insert(categories)
          .values(row)
          .onConflictDoNothing()
          .returning({ id: categories.id });
        if (res.length > 0) tables.categories.inserted += 1;
        else tables.categories.skipped += 1;
      }

      for (const row of snapshot.breedRows) {
        const res = await tx
          .insert(breeds)
          .values(row)
          .onConflictDoNothing()
          .returning({ id: breeds.id });
        if (res.length > 0) tables.breeds.inserted += 1;
        else tables.breeds.skipped += 1;
      }

      for (const row of snapshot.indicativePriceRows) {
        const res = await tx
          .insert(indicativePrices)
          .values(row)
          .onConflictDoNothing()
          .returning({ id: indicativePrices.id });
        if (res.length > 0) tables.indicative_prices.inserted += 1;
        else tables.indicative_prices.skipped += 1;
      }

      for (const row of snapshot.articleRows) {
        const res = await tx
          .insert(articles)
          .values(row)
          .onConflictDoNothing()
          .returning({ id: articles.id });
        if (res.length > 0) tables.articles.inserted += 1;
        else tables.articles.skipped += 1;
      }

      for (const row of snapshot.faqRows) {
        const res = await tx
          .insert(faqs)
          .values(row)
          .onConflictDoNothing()
          .returning({ id: faqs.id });
        if (res.length > 0) tables.faqs.inserted += 1;
        else tables.faqs.skipped += 1;
      }

      if (dryRun) {
        throw new DryRunRollbackSignal();
      }
      committed = true;
    });
  } catch (err) {
    if (err instanceof DryRunRollbackSignal) {
      return { committed: false, dryRun: true, tables };
    }
    throw err;
  }

  return { committed, dryRun: false, tables };
}

async function main() {
  loadEnvForEntryPoint();

  const dryRun = process.argv.includes('--dry-run');
  const preflightOnly = process.argv.includes('--preflight-only');
  const snapshot = prepareReferenceCatalogSnapshot();

  console.log('[seed-catalog] Canonical reference catalog validated:');
  for (const [table, count] of Object.entries(snapshot.counts)) {
    console.log(`  ${table}: ${count} records`);
  }

  if (preflightOnly) {
    console.log('[seed-catalog] --preflight-only complete. No PostgreSQL connection opened.');
    return;
  }

  const pgCfg = resolvePostgresConfigFromEnv(process.env, process.env.NODE_ENV === 'production');
  if (!pgCfg || (!pgCfg.connectionString && !(pgCfg.host && pgCfg.database && pgCfg.user))) {
    throw new Error(
      'PostgreSQL connection configuration is missing (set DATABASE_URL or PGHOST/PGDATABASE/PGUSER). Pass --preflight-only for offline validation.'
    );
  }

  const pool = createPgPool(pgCfg);
  try {
    await verifyDatabaseStartup(pool);
    const db = createDb(pool);
    const result = await seedReferenceCatalog(db, snapshot, { dryRun });

    console.log('[seed-catalog] Summary:');
    for (const [table, stats] of Object.entries(result.tables)) {
      console.log(
        `  ${table}: planned=${stats.planned}, inserted=${stats.inserted}, skipped_existing=${stats.skipped}`
      );
    }

    if (dryRun) {
      console.log('[seed-catalog] --dry-run rolled back cleanly. Zero rows committed.');
    } else if (result.committed) {
      console.log('[seed-catalog] Reference catalog seed committed safely without modifying existing rows.');
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error('[seed-catalog] Failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
