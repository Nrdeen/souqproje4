import type { AppNotification } from '../types/marketplace';
import {
  areDirectoryFiltersEqual,
  directoryFiltersToSearchParams,
  normalizeDirectoryFilters,
  parseDirectoryFiltersFromSearchParams,
  type DirectoryFilters,
} from './listing-search';

export type PageView =
  | 'home'
  | 'listings'
  | 'detail'
  | 'add'
  | 'services'
  | 'breeds'
  | 'breeders'
  | 'pricing'
  | 'commission'
  | 'weights'
  | 'feast'
  | 'transport'
  | 'feed'
  | 'occasions'
  | 'how'
  | 'guides'
  | 'help'
  | 'about'
  | 'rules'
  | 'privacy'
  | 'terms'
  | 'contact'
  | 'dashboard'
  | 'seller'
  | 'login';

export type DashboardTab =
  | 'my-listings'
  | 'profile'
  | 'favorites'
  | 'likes'
  | 'messages'
  | 'analytics'
  | 'admin';

export type AuthMode = 'login' | 'register';

export interface AppRoute {
  page: PageView;
  listingId: string | null;
  sellerId: string | null;
  editingListingId: string | null;
  dashboardTab: DashboardTab | null;
  conversationId: string | null;
  commentId: string | null;
  authMode: AuthMode;
  listingFilters: DirectoryFilters;
}

const VALID_DASHBOARD_TABS = new Set<DashboardTab>([
  'my-listings',
  'profile',
  'favorites',
  'likes',
  'messages',
  'analytics',
  'admin',
]);

export function isDashboardTab(value: string | null | undefined): value is DashboardTab {
  return Boolean(value && VALID_DASHBOARD_TABS.has(value as DashboardTab));
}

export function createRoute(
  partial: Omit<Partial<AppRoute>, 'listingFilters'> & {
    page: PageView;
    listingFilters?: Partial<DirectoryFilters>;
  }
): AppRoute {
  return {
    listingId: null,
    sellerId: null,
    editingListingId: null,
    dashboardTab: null,
    conversationId: null,
    commentId: null,
    authMode: 'login',
    ...partial,
    listingFilters: normalizeDirectoryFilters(partial.listingFilters),
  };
}

function safeDecodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment).trim();
  } catch {
    return segment.trim();
  }
}

/**
 * Parses a browser pathname + search string into a typed AppRoute.
 * Preserves backward compatibility with legacy `/?listing=<id>` URLs while
 * supporting clean direct URLs for main pages, listings (including filter query state),
 * seller profiles, auth modes, and dashboard tabs.
 */
export function parseUrlToRoute(pathname: string, search = ''): AppRoute {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const queryListing = params.get('listing')?.trim() || '';
  const queryComment = params.get('comment')?.trim() || null;

  // Backward-compatible listing query parameter takes precedence (e.g. /?listing=lst_101)
  if (queryListing) {
    return createRoute({
      page: 'detail',
      listingId: queryListing,
      commentId: queryComment,
    });
  }

  const querySeller = params.get('seller')?.trim() || '';
  if (querySeller) {
    return createRoute({
      page: 'seller',
      sellerId: querySeller,
    });
  }

  const normalizedPath =
    pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname || '/';
  const segments = normalizedPath.split('/').filter(Boolean).map(safeDecodeSegment);

  if (segments.length === 0) {
    return createRoute({ page: 'home' });
  }

  const [first, second, third] = segments;

  if (first === 'listings' || first === 'listing') {
    if (!second) {
      return createRoute({
        page: 'listings',
        listingFilters: parseDirectoryFiltersFromSearchParams(params),
      });
    }
    if (third === 'edit') {
      return createRoute({
        page: 'add',
        editingListingId: second,
      });
    }
    return createRoute({
      page: 'detail',
      listingId: second,
      commentId: queryComment,
    });
  }

  if (first === 'sellers' || first === 'seller') {
    if (second) {
      return createRoute({
        page: 'seller',
        sellerId: second,
      });
    }
    return createRoute({ page: 'breeders' });
  }

  if (first === 'services') {
    return createRoute({ page: 'services' });
  }

  if (first === 'breeds' || first === 'prices') {
    return createRoute({ page: 'breeds' });
  }

  if (first === 'breeders') {
    return createRoute({ page: 'breeders' });
  }

  if (first === 'pricing') {
    return createRoute({ page: 'pricing' });
  }

  if (first === 'commission') {
    return createRoute({ page: 'commission' });
  }

  if (first === 'weights') {
    return createRoute({ page: 'weights' });
  }

  if (first === 'feast') {
    return createRoute({ page: 'feast' });
  }

  if (first === 'transport-calculator' || first === 'transport') {
    return createRoute({ page: 'transport' });
  }

  if (first === 'feed-calculator' || first === 'feed') {
    return createRoute({ page: 'feed' });
  }

  if (first === 'occasions') {
    return createRoute({ page: 'occasions' });
  }

  if (first === 'how') {
    return createRoute({ page: 'how' });
  }

  if (first === 'guides' || first === 'articles') {
    return createRoute({ page: 'guides' });
  }

  if (first === 'help' || first === 'faq') {
    return createRoute({ page: 'help' });
  }

  if (first === 'about') {
    return createRoute({ page: 'about' });
  }

  if (first === 'rules') {
    return createRoute({ page: 'rules' });
  }

  if (first === 'privacy') {
    return createRoute({ page: 'privacy' });
  }

  if (first === 'terms' || first === 'policies') {
    return createRoute({ page: 'terms' });
  }

  if (first === 'contact') {
    return createRoute({ page: 'contact' });
  }

  if (first === 'add') {
    const editId = params.get('edit')?.trim() || null;
    return createRoute({
      page: 'add',
      editingListingId: editId,
    });
  }

  if (first === 'register') {
    return createRoute({
      page: 'login',
      authMode: 'register',
    });
  }

  if (first === 'login') {
    return createRoute({
      page: 'login',
      authMode: params.get('mode') === 'register' ? 'register' : 'login',
    });
  }

  if (first === 'dashboard') {
    const tabFromPath = isDashboardTab(second) ? second : null;
    const tabFromQuery = params.get('tab');
    const dashboardTab =
      tabFromPath || (isDashboardTab(tabFromQuery) ? tabFromQuery : null);
    const conversationId = params.get('conversation')?.trim() || null;
    return createRoute({
      page: 'dashboard',
      dashboardTab,
      conversationId,
    });
  }

  return createRoute({ page: 'home' });
}

/**
 * Serializes an AppRoute back into a clean relative URL (pathname + search).
 */
export function routeToUrl(route: AppRoute): string {
  switch (route.page) {
    case 'home':
      return '/';
    case 'listings': {
      const qs = directoryFiltersToSearchParams(route.listingFilters).toString();
      return qs ? `/listings?${qs}` : '/listings';
    }
    case 'detail': {
      if (!route.listingId) return '/listings';
      const base = `/listings/${encodeURIComponent(route.listingId)}`;
      if (route.commentId) {
        return `${base}?comment=${encodeURIComponent(route.commentId)}`;
      }
      return base;
    }
    case 'seller':
      return route.sellerId
        ? `/sellers/${encodeURIComponent(route.sellerId)}`
        : '/breeders';
    case 'services':
      return '/services';
    case 'breeds':
      return '/breeds';
    case 'breeders':
      return '/breeders';
    case 'pricing':
      return '/pricing';
    case 'commission':
      return '/commission';
    case 'weights':
      return '/weights';
    case 'feast':
      return '/feast';
    case 'transport':
      return '/transport-calculator';
    case 'feed':
      return '/feed-calculator';
    case 'occasions':
      return '/occasions';
    case 'how':
      return '/how';
    case 'guides':
      return '/guides';
    case 'help':
      return '/help';
    case 'about':
      return '/about';
    case 'rules':
      return '/rules';
    case 'privacy':
      return '/privacy';
    case 'terms':
      return '/terms';
    case 'contact':
      return '/contact';
    case 'add':
      return route.editingListingId
        ? `/listings/${encodeURIComponent(route.editingListingId)}/edit`
        : '/add';
    case 'login':
      return route.authMode === 'register' ? '/register' : '/login';
    case 'dashboard': {
      const base = route.dashboardTab
        ? `/dashboard/${route.dashboardTab}`
        : '/dashboard';
      if (route.dashboardTab === 'messages' && route.conversationId) {
        return `${base}?conversation=${encodeURIComponent(route.conversationId)}`;
      }
      return base;
    }
  }
}

export function buildListingShareUrl(listingId: string, origin?: string): string {
  const path = `/?listing=${encodeURIComponent(listingId)}`;
  return origin ? `${origin}${path}` : path;
}

export function routesEqual(a: AppRoute, b: AppRoute): boolean {
  return (
    a.page === b.page &&
    a.listingId === b.listingId &&
    a.sellerId === b.sellerId &&
    a.editingListingId === b.editingListingId &&
    a.dashboardTab === b.dashboardTab &&
    a.conversationId === b.conversationId &&
    a.commentId === b.commentId &&
    a.authMode === b.authMode &&
    areDirectoryFiltersEqual(a.listingFilters, b.listingFilters)
  );
}

/**
 * Resolves the destination route when the user clicks an in-app notification.
 */
export function buildNotificationTargetRoute(item: AppNotification): AppRoute {
  if (item.type === 'new_message') {
    return createRoute({
      page: 'dashboard',
      dashboardTab: 'messages',
      conversationId: item.conversationId || null,
    });
  }

  if (
    item.type === 'seller_verified' ||
    item.type === 'seller_verification_rejected' ||
    item.type === 'listing_rejected'
  ) {
    return createRoute({
      page: 'dashboard',
      dashboardTab: 'my-listings',
    });
  }

  if (
    item.type === 'commission_due' ||
    item.type === 'commission_submitted'
  ) {
    return createRoute({
      page: 'dashboard',
      dashboardTab: 'admin',
    });
  }

  if (
    item.type === 'commission_approved' ||
    item.type === 'commission_rejected' ||
    item.type === 'featured_approved'
  ) {
    return createRoute({
      page: 'dashboard',
      dashboardTab: 'my-listings',
    });
  }

  if (item.listingId) {
    return createRoute({
      page: 'detail',
      listingId: item.listingId,
      commentId:
        item.type === 'new_comment' || item.type === 'comment_reply'
          ? item.commentId || null
          : null,
    });
  }

  return createRoute({
    page: 'dashboard',
    dashboardTab: 'my-listings',
  });
}
