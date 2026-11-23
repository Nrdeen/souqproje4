export const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Computes the target index to focus when handling Tab / Shift+Tab inside a modal focus trap.
 * Returns null if normal browser tab order inside the dialog should proceed without wrapping.
 */
export function getFocusTrapTargetIndex(params: {
  totalFocusable: number;
  activeIndex: number;
  shiftKey: boolean;
}): number | null {
  const { totalFocusable, activeIndex, shiftKey } = params;
  if (totalFocusable <= 0) return null;

  if (shiftKey) {
    if (activeIndex <= 0) {
      return totalFocusable - 1;
    }
    return null;
  }

  if (activeIndex === -1 || activeIndex >= totalFocusable - 1) {
    return 0;
  }

  return null;
}

/**
 * Pure RTL-aware index stepper for image lightbox and carousel navigation.
 */
export function stepLightboxIndex(
  currentIndex: number,
  total: number,
  direction: 'next' | 'prev'
): number {
  if (total <= 1) return 0;
  const normalized = ((currentIndex % total) + total) % total;
  return direction === 'next' ? (normalized + 1) % total : (normalized - 1 + total) % total;
}

/**
 * Maps local static marketplace .jpg assets to their sibling .webp format while leaving
 * user-uploaded /api/v1/media/* or external URLs completely untouched.
 */
export function resolveMarketplaceWebp(src: string): string | null {
  const match = src.match(/^(\/src\/assets\/images\/[^?#]+)\.jpg([?#].*)?$/i);
  if (!match) return null;
  return `${match[1]}.webp${match[2] || ''}`;
}
