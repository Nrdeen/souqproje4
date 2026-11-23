import type { Listing } from '../types/marketplace';
import { formatPriceSar } from './format';
import { buildListingShareUrl as buildPureListingShareUrl } from './router';

export interface ListingSharePayload {
  url: string;
  title: string;
  summary: string;
  whatsappHref: string;
  twitterHref: string;
}

export function buildListingShareUrl(listingId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
  return buildPureListingShareUrl(listingId, origin);
}

export function buildListingSharePayload(input: {
  listing: Pick<Listing, 'id' | 'title' | 'priceAmount' | 'city'>;
  breedName?: string;
  regionName?: string;
  lang?: 'ar' | 'en';
}): ListingSharePayload {
  const lang = input.lang ?? 'ar';
  const isEn = lang === 'en';
  const url = buildListingShareUrl(input.listing.id);
  const locationLabel = input.regionName
    ? `${input.regionName} — ${input.listing.city}`
    : input.listing.city;
  const parts = [
    input.listing.title,
    input.breedName ? `${isEn ? 'Breed' : 'السلالة'}: ${input.breedName}` : null,
    `${isEn ? 'Price' : 'السعر'}: ${formatPriceSar(input.listing.priceAmount, lang)}`,
    locationLabel,
  ].filter(Boolean);
  const summary = parts.join(' · ');

  return {
    url,
    title: input.listing.title,
    summary,
    whatsappHref: `https://wa.me/?text=${encodeURIComponent(`${summary}\n${url}`)}`,
    twitterHref: `https://twitter.com/intent/tweet?text=${encodeURIComponent(summary)}&url=${encodeURIComponent(url)}`,
  };
}

export async function copyTextWithFallback(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to execCommand below
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  }

  return false;
}

export function canUseNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function triggerNativeShareWithFallback(input: {
  title: string;
  text: string;
  url: string;
  onFallbackCopy: () => Promise<void> | void;
}): Promise<'shared' | 'cancelled' | 'fallback'> {
  if (!canUseNativeShare()) {
    await input.onFallbackCopy();
    return 'fallback';
  }
  try {
    await navigator.share({
      title: input.title,
      text: input.text,
      url: input.url,
    });
    return 'shared';
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return 'cancelled';
    }
    await input.onFallbackCopy();
    return 'fallback';
  }
}
