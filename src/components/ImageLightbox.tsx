import { useEffect, useId, useRef, type RefObject } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  getFocusTrapTargetIndex,
  MODAL_FOCUSABLE_SELECTOR,
  stepLightboxIndex,
} from '../lib/modal-focus';
import { SafeImage } from './SafeImage';

export interface LightboxImageItem {
  id: string;
  url: string;
}

interface ImageLightboxProps {
  open: boolean;
  images: LightboxImageItem[];
  currentIndex: number;
  title: string;
  onClose: () => void;
  onChangeIndex: (nextIndex: number) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export { stepLightboxIndex };

export function ImageLightbox({
  open,
  images,
  currentIndex,
  title,
  onClose,
  onChangeIndex,
  returnFocusRef,
}: ImageLightboxProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  const onChangeIndexRef = useRef(onChangeIndex);
  onCloseRef.current = onClose;
  onChangeIndexRef.current = onChangeIndex;

  const total = images.length;
  const safeIndex = total > 0 ? Math.min(Math.max(0, currentIndex), total - 1) : 0;
  const activeImage = images[safeIndex];

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const getFocusableElements = (): HTMLElement[] => {
      const container = dialogRef.current;
      if (!container) return [];
      return Array.from(container.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || window.getComputedStyle(el).position === 'fixed'
      );
    };

    const rafId = window.requestAnimationFrame(() => {
      if (closeBtnRef.current) {
        closeBtnRef.current.focus();
      } else {
        dialogRef.current?.focus();
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key === 'ArrowLeft' && total > 1) {
        event.preventDefault();
        onChangeIndexRef.current(stepLightboxIndex(safeIndex, total, 'next'));
        return;
      }

      if (event.key === 'ArrowRight' && total > 1) {
        event.preventDefault();
        onChangeIndexRef.current(stepLightboxIndex(safeIndex, total, 'prev'));
        return;
      }

      if (event.key === 'Tab') {
        const container = dialogRef.current;
        if (!container) return;
        const focusables = getFocusableElements();
        if (focusables.length === 0) {
          event.preventDefault();
          container.focus();
          return;
        }
        const activeIdx = focusables.indexOf(document.activeElement as HTMLElement);
        const nextIdx = getFocusTrapTargetIndex({
          totalFocusable: focusables.length,
          activeIndex: activeIdx,
          shiftKey: event.shiftKey,
        });
        if (nextIdx !== null) {
          event.preventDefault();
          focusables[nextIdx]?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);

      const fallbackTarget = returnFocusRef?.current || previousActiveElement;
      if (fallbackTarget && typeof fallbackTarget.focus === 'function' && fallbackTarget.isConnected) {
        fallbackTarget.focus();
      }
    };
  }, [open, safeIndex, total, returnFocusRef]);

  if (!open || !activeImage) return null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-black/92 backdrop-blur-xs flex items-center justify-center p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClick={() => onClose()}
    >
      <h2 id={titleId} className="sr-only">
        معاينة صورة: {title}
      </h2>

      <button
        ref={closeBtnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="إغلاق المعاينة"
        className="absolute top-4 left-4 w-11 h-11 rounded-lg bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
      >
        <X size={20} aria-hidden="true" />
      </button>

      {total > 1 && (
        <>
          <button
            type="button"
            aria-label="الصورة السابقة"
            onClick={(e) => {
              e.stopPropagation();
              onChangeIndex(stepLightboxIndex(safeIndex, total, 'prev'));
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-lg bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
          >
            <ChevronRight size={22} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="الصورة التالية"
            onClick={(e) => {
              e.stopPropagation();
              onChangeIndex(stepLightboxIndex(safeIndex, total, 'next'));
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-lg bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
          >
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
        </>
      )}

      <div
        className="max-w-5xl max-h-[85vh] w-full flex flex-col items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <SafeImage
          src={activeImage.url}
          alt={`${title} - صورة ${safeIndex + 1} من ${total}`}
          width={800}
          height={597}
          loading="eager"
          decoding="sync"
          className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
        />
        <p
          id={descId}
          aria-live="polite"
          className="mt-3 text-xs text-white/90 tabular-nums text-center px-4"
        >
          {title} · صورة {safeIndex + 1} من {total}
        </p>
      </div>
    </div>
  );
}
