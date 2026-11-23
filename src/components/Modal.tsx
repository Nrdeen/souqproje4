import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { getFocusTrapTargetIndex, MODAL_FOCUSABLE_SELECTOR } from '../lib/modal-focus';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: 'md' | 'lg' | 'xl';
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'lg',
  children,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
      const container = dialogRef.current;
      if (!container) return;
      const focusables = getFocusableElements();
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        container.focus();
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
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
        const activeIndex = focusables.indexOf(document.activeElement as HTMLElement);
        const nextIndex = getFocusTrapTargetIndex({
          totalFocusable: focusables.length,
          activeIndex,
          shiftKey: event.shiftKey,
        });
        if (nextIndex !== null) {
          event.preventDefault();
          focusables[nextIndex]?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (
        previousActiveElement &&
        typeof previousActiveElement.focus === 'function' &&
        previousActiveElement.isConnected
      ) {
        previousActiveElement.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  const sizeClass =
    size === 'md' ? 'max-w-md' : size === 'xl' ? 'max-w-2xl' : 'max-w-lg';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] w-full shadow-xl overflow-hidden flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] my-auto outline-none ${sizeClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-start justify-between gap-4 px-5 sm:px-6 py-4 bg-[var(--color-cream)]/70 border-b border-[var(--color-border)]">
          <div className="min-w-0">
            <h3 id={titleId} className="font-display text-lg font-bold text-[var(--color-ink)]">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-[var(--color-muted)] mt-0.5 leading-relaxed">{subtitle}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="w-9 h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-ink)] shrink-0 transition-colors cursor-pointer"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 sm:p-6 text-[var(--color-ink)] overflow-y-auto overscroll-contain flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
