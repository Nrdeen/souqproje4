import { normalizeArabicSearchText } from '../../src/lib/listing-search';

export interface SearchContextNames {
  breedName?: string;
  categoryName?: string;
  subCategoryName?: string;
  regionName?: string;
  sellerDisplayName?: string;
}

/**
 * Computes the normalized city string and full search haystack stored on `listings`
 * so PostgreSQL LIKE/pg_trgm queries match in-memory `listingMatchesSearchQuery` 1:1.
 */
export function buildListingNormalizedColumns(
  listing: {
    title: string;
    description?: string | null;
    city: string;
  },
  names: SearchContextNames = {}
): { cityNorm: string; searchDoc: string } {
  const cityNorm = normalizeArabicSearchText(listing.city || '');
  const searchDoc = normalizeArabicSearchText(
    [
      listing.title,
      listing.description || '',
      listing.city,
      names.breedName || '',
      names.categoryName || '',
      names.subCategoryName || '',
      names.regionName || '',
      names.sellerDisplayName || '',
    ]
      .filter(Boolean)
      .join(' ')
  );
  return { cityNorm, searchDoc };
}

export function tokenizeNormalizedQuery(rawQuery: string): string[] {
  const normalized = normalizeArabicSearchText(rawQuery || '');
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}
