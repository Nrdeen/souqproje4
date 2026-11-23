import { ShieldCheck } from 'lucide-react';
import type { SellerProfile } from '../types/marketplace';
import { useI18n } from '../lib/i18n';

export function isSellerVerified(
  seller?: Pick<SellerProfile, 'verificationStatus' | 'verifiedAt'> | null
): boolean {
  if (!seller) return false;
  if (seller.verificationStatus) {
    return seller.verificationStatus === 'Verified';
  }
  return Boolean(seller.verifiedAt);
}

interface VerifiedSellerBadgeProps {
  variant?: 'inline' | 'badge' | 'compact';
  label?: string;
  tone?: 'default' | 'on-dark';
}

export function VerifiedSellerBadge({
  variant = 'badge',
  label,
  tone = 'default',
}: VerifiedSellerBadgeProps) {
  const { isEn } = useI18n();
  const displayLabel = label ?? (isEn ? 'Verified Breeder' : 'مربي موثق');

  if (tone === 'on-dark') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white px-2.5 py-1 rounded-lg bg-[#0B2A1E]/75 border border-[#E8BC63]/45 backdrop-blur-xs">
        <ShieldCheck size={14} className="text-[#E8BC63] shrink-0" aria-hidden="true" />
        <span>{displayLabel}</span>
      </span>
    );
  }

  if (variant === 'inline') {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-green-ink)]">
        <ShieldCheck size={13} className="text-[var(--color-green-ink)] shrink-0" aria-hidden="true" />
        <span>{displayLabel}</span>
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-green-ink)]"
        title={isEn ? 'Verified by SouqAlGhanam Admin' : 'حساب مربي موثق من إدارة المنصة'}
      >
        <ShieldCheck size={13} className="text-[var(--color-gold)] shrink-0" aria-hidden="true" />
        <span>{displayLabel}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-green-ink)] text-xs">
      <ShieldCheck size={15} className="text-[var(--color-green-ink)] shrink-0" aria-hidden="true" />
      <span>{displayLabel}</span>
    </span>
  );
}
