import { useEffect, useState } from 'react';
import { resolveMarketplaceWebp } from '../lib/modal-focus';

export { resolveMarketplaceWebp };

interface SafeImageProps {
  src?: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'sync' | 'auto';
  fetchPriority?: 'high' | 'low' | 'auto';
  width?: number;
  height?: number;
}

export function SafeImage({
  src,
  alt,
  className = '',
  loading = 'lazy',
  decoding = 'async',
  fetchPriority,
  width,
  height,
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  const [webpFailed, setWebpFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setWebpFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-b from-[var(--color-cream)] to-[var(--color-cream-hover)]/70 text-[var(--color-green-ink)]/70 select-none ${className}`}
        role="img"
        aria-label={alt}
      >
        <div className="w-12 h-12 rounded-xl bg-[var(--color-surface)]/80 border border-[var(--color-border)] flex items-center justify-center text-[var(--color-green-ink)]/75">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16" />
            <path d="M14 14l1.586-1.586a2 2 0 0 1 2.828 0L20 14" />
            <rect x="3" y="4" width="18" height="16" rx="2" />
          </svg>
        </div>
        <span className="mt-2.5 text-[11px] font-medium text-[var(--color-muted)] px-4 text-center line-clamp-1 max-w-full">
          {alt}
        </span>
      </div>
    );
  }

  const webpSrc = webpFailed ? null : resolveMarketplaceWebp(src);
  const imgElement = (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      {...(fetchPriority ? { fetchPriority } : {})}
      referrerPolicy="no-referrer"
      onError={() => {
        if (webpSrc) {
          setWebpFailed(true);
        } else {
          setFailed(true);
        }
      }}
      className={className}
    />
  );

  if (webpSrc) {
    return (
      <picture className="contents">
        <source srcSet={webpSrc} type="image/webp" />
        {imgElement}
      </picture>
    );
  }

  return imgElement;
}
