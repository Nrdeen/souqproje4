import type { Listing, SellerProfile } from '../types/marketplace';

/**
 * Resolves a requested listing strictly by ID without falling back to an unrelated listing.
 */
export function resolveRequestedListing(params: {
  listingId: string | null;
  allListings: Listing[];
  publishedListings: Listing[];
}): Listing | null {
  const id = params.listingId?.trim();
  if (!id) return null;
  return (
    params.allListings.find((item) => item.id === id) ||
    params.publishedListings.find((item) => item.id === id) ||
    null
  );
}

/**
 * Resolves a requested seller profile strictly by userId.
 */
export function resolveRequestedSeller(params: {
  sellerId: string | null;
  sellers: SellerProfile[];
}): SellerProfile | null {
  const id = params.sellerId?.trim();
  if (!id) return null;
  return params.sellers.find((seller) => seller.userId === id) || null;
}

/**
 * Partitions sellers so only strictly verified sellers appear under "Verified Breeders" headings,
 * while keeping non-verified sellers browsable in a separately labeled section.
 */
export function partitionSellersByVerification(sellers: SellerProfile[]): {
  verifiedSellers: SellerProfile[];
  otherSellers: SellerProfile[];
} {
  const verifiedSellers: SellerProfile[] = [];
  const otherSellers: SellerProfile[] = [];

  for (const seller of sellers) {
    if (seller.verificationStatus === 'Verified') {
      verifiedSellers.push(seller);
    } else {
      otherSellers.push(seller);
    }
  }

  return { verifiedSellers, otherSellers };
}

export interface SellerContactLinks {
  phoneDisplay: string | null;
  telHref: string | null;
  whatsappHref: string | null;
}

/**
 * Builds direct telephone and WhatsApp links strictly for signed-in non-owner viewers
 * when contact details are present according to backend privacy serialization.
 */
export function buildSellerContactLinks(params: {
  isSignedIn: boolean;
  isOwner: boolean;
  seller?: Pick<SellerProfile, 'phone' | 'whatsapp'> | null;
  listingTitle: string;
  lang?: 'ar' | 'en';
}): SellerContactLinks {
  if (!params.isSignedIn || params.isOwner || !params.seller) {
    return { phoneDisplay: null, telHref: null, whatsappHref: null };
  }

  const rawPhone = params.seller.phone?.trim() || '';
  const phoneDigits = rawPhone.replace(/[^\d+]/g, '');
  const telHref = phoneDigits ? `tel:${phoneDigits}` : null;

  const rawWhatsapp = params.seller.whatsapp?.trim() || rawPhone;
  let waDigits = rawWhatsapp.replace(/\D/g, '');
  if (waDigits.startsWith('00')) {
    waDigits = waDigits.slice(2);
  }
  if (/^05\d{8}$/.test(waDigits)) {
    waDigits = `966${waDigits.slice(1)}`;
  } else if (/^5\d{8}$/.test(waDigits)) {
    waDigits = `966${waDigits}`;
  }

  const messageText =
    params.lang === 'en'
      ? `Hello, I am inquiring about listing: ${params.listingTitle}`
      : `السلام عليكم، أستفسر عن إعلان: ${params.listingTitle}`;
  const whatsappHref =
    waDigits.length >= 9
      ? `https://wa.me/${waDigits}?text=${encodeURIComponent(messageText)}`
      : null;

  return {
    phoneDisplay: rawPhone || null,
    telHref,
    whatsappHref,
  };
}

export interface RoleAwareNavItem {
  key: string;
  page: 'home' | 'listings' | 'services' | 'pricing' | 'breeds' | 'breeders' | 'dashboard';
  dashboardTab?: 'my-listings' | 'favorites' | 'likes' | 'messages' | 'analytics' | 'admin';
  label: string;
}

export function getRoleAwareNavItems(
  role: 'buyer' | 'seller' | 'admin' | null,
  lang: 'ar' | 'en' = 'ar'
): RoleAwareNavItem[] {
  const isEn = lang === 'en';
  const base: RoleAwareNavItem[] = [
    { key: 'home', page: 'home', label: isEn ? 'Home' : 'الرئيسية' },
    { key: 'listings', page: 'listings', label: isEn ? 'Listings' : 'الإعلانات' },
    { key: 'services', page: 'services', label: isEn ? 'Services' : 'الخدمات' },
    { key: 'pricing', page: 'pricing', label: isEn ? 'Plans & Pricing' : 'الباقات والأسعار' },
  ];

  if (!role) {
    return base;
  }

  if (role === 'admin') {
    return [
      ...base,
      {
        key: 'dashboard',
        page: 'dashboard',
        dashboardTab: 'my-listings',
        label: isEn ? 'My Account' : 'حسابي',
      },
      {
        key: 'admin',
        page: 'dashboard',
        dashboardTab: 'admin',
        label: isEn ? 'Admin Panel' : 'لوحة المشرف',
      },
    ];
  }

  return [...base, { key: 'dashboard', page: 'dashboard', label: isEn ? 'My Account' : 'حسابي' }];
}

export interface RoleAwareFooterLink {
  key: string;
  label: string;
  page: 'add' | 'login' | 'dashboard';
  authMode?: 'login' | 'register';
  dashboardTab?: 'my-listings' | 'favorites' | 'likes' | 'messages' | 'analytics' | 'admin';
}

export function getRoleAwareFooterAccountLinks(
  role: 'buyer' | 'seller' | 'admin' | null,
  lang: 'ar' | 'en' = 'ar'
): RoleAwareFooterLink[] {
  const isEn = lang === 'en';
  if (!role) {
    return [
      { key: 'login', label: isEn ? 'Sign In' : 'تسجيل الدخول', page: 'login', authMode: 'login' },
      {
        key: 'register',
        label: isEn ? 'Create Account' : 'إنشاء حساب جديد',
        page: 'login',
        authMode: 'register',
      },
    ];
  }

  if (role === 'admin') {
    return [
      {
        key: 'admin',
        label: isEn ? 'Moderation & Admin Panel' : 'لوحة الإشراف والمراجعة',
        page: 'dashboard',
        dashboardTab: 'admin',
      },
      {
        key: 'my-listings',
        label: isEn ? 'My Listings' : 'إعلاناتي',
        page: 'dashboard',
        dashboardTab: 'my-listings',
      },
      {
        key: 'messages',
        label: isEn ? 'Messages' : 'المحادثات',
        page: 'dashboard',
        dashboardTab: 'messages',
      },
      {
        key: 'analytics',
        label: isEn ? 'Performance Analytics' : 'لوحة تحكم الأداء',
        page: 'dashboard',
        dashboardTab: 'analytics',
      },
    ];
  }

  if (role === 'seller') {
    return [
      {
        key: 'my-listings',
        label: isEn ? 'My Listings & Verification' : 'إعلاناتي وتوثيق المراح',
        page: 'dashboard',
        dashboardTab: 'my-listings',
      },
      {
        key: 'messages',
        label: isEn ? 'Messages & Price Offers' : 'المحادثات وعروض السعر',
        page: 'dashboard',
        dashboardTab: 'messages',
      },
      {
        key: 'favorites',
        label: isEn ? 'Favorites' : 'المفضلة',
        page: 'dashboard',
        dashboardTab: 'favorites',
      },
      {
        key: 'analytics',
        label: isEn ? 'Performance Analytics' : 'لوحة تحكم الأداء',
        page: 'dashboard',
        dashboardTab: 'analytics',
      },
    ];
  }

  return [
    {
      key: 'messages',
      label: isEn ? 'Messages & Price Offers' : 'المحادثات وعروض السعر',
      page: 'dashboard',
      dashboardTab: 'messages',
    },
    {
      key: 'favorites',
      label: isEn ? 'Favorites' : 'المفضلة',
      page: 'dashboard',
      dashboardTab: 'favorites',
    },
    {
      key: 'likes',
      label: isEn ? 'My Likes' : 'إعجاباتي',
      page: 'dashboard',
      dashboardTab: 'likes',
    },
  ];
}

export type ListingStatusBadgeKind =
  | 'sold'
  | 'featured'
  | 'new'
  | 'pending'
  | 'rejected'
  | 'draft'
  | 'expired';

export interface ListingStatusBadgeInfo {
  kind: ListingStatusBadgeKind;
  label: string;
}

export const NEW_LISTING_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Resolves a single visual status badge for a listing card based on its lifecycle status,
 * featured flag, and publication recency.
 */
export function resolveListingStatusBadge(
  listing: Pick<Listing, 'status' | 'isFeatured' | 'publishedAt' | 'createdAt'>,
  options: { lang?: 'ar' | 'en'; nowMs?: number } = {}
): ListingStatusBadgeInfo | null {
  const isEn = options.lang === 'en';
  const nowMs = options.nowMs ?? Date.now();

  if (listing.status === 'Sold') {
    return { kind: 'sold', label: isEn ? 'Sold' : 'مباع' };
  }
  if (listing.status === 'Pending') {
    return { kind: 'pending', label: isEn ? 'Pending' : 'قيد المراجعة' };
  }
  if (listing.status === 'Rejected') {
    return { kind: 'rejected', label: isEn ? 'Rejected' : 'مرفوض' };
  }
  if (listing.status === 'Draft') {
    return { kind: 'draft', label: isEn ? 'Draft' : 'مسودة' };
  }
  if (listing.status === 'Expired') {
    return { kind: 'expired', label: isEn ? 'Expired' : 'منتهي' };
  }
  if (listing.isFeatured) {
    return { kind: 'featured', label: isEn ? 'Featured' : 'مميز' };
  }

  const publishedTs = new Date(listing.publishedAt || listing.createdAt).getTime();
  if (Number.isFinite(publishedTs)) {
    const ageMs = nowMs - publishedTs;
    if (ageMs <= NEW_LISTING_MAX_AGE_MS && ageMs >= -24 * 60 * 60 * 1000) {
      return { kind: 'new', label: isEn ? 'New' : 'جديد' };
    }
  }

  return null;
}

