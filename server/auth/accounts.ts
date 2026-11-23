import crypto from 'node:crypto';
import type { GoogleIdentityRecord } from './types';

export function createUserRecord(input: {
  name: string;
  phone: string | null;
  email?: string;
  role: 'buyer' | 'seller' | 'admin';
  isDemo?: boolean;
}) {
  const id = `usr_${crypto.randomUUID().slice(0, 8)}`;
  const cleanPhone = typeof input.phone === 'string' && input.phone.trim() ? input.phone.trim() : null;
  const fallbackEmail = cleanPhone ? `${cleanPhone}@souqalghanam.sa` : `${id}@users.souqalghanam.local`;
  const cleanEmail =
    typeof input.email === 'string' && input.email.trim()
      ? input.email.trim().toLowerCase().slice(0, 255)
      : fallbackEmail;

  return {
    id,
    phone: cleanPhone,
    email: cleanEmail,
    name: input.name,
    role: input.role,
    status: 'active',
    phoneVerifiedAt: null as string | null,
    createdAt: new Date().toISOString(),
    ...(input.isDemo ? { isDemo: true } : {}),
  };
}

export function createGoogleIdentityRecord(input: {
  userId: string;
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
  pictureUrl?: string | null;
}): GoogleIdentityRecord {
  const nowIso = new Date().toISOString();
  return {
    id: `gid_${crypto.randomUUID().slice(0, 10)}`,
    userId: input.userId,
    provider: 'google',
    subject: input.subject,
    email: input.email.trim().toLowerCase(),
    emailVerified: Boolean(input.emailVerified),
    name: input.name,
    pictureUrl: input.pictureUrl || null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function buildSellerProfile(
  user: { id: string; name: string; phone?: string | null },
  extra: { regionId?: string; city?: string } = {}
) {
  const nowIso = new Date().toISOString();
  const phone = typeof user.phone === 'string' ? user.phone.trim() : '';
  return {
    userId: user.id,
    displayName: `مراح ${user.name}`,
    bio: 'مربٍ وبائع مواشٍ مسجل في منصة سوق الغنم.',
    regionId: extra.regionId || 'reg_riyadh',
    city: extra.city || 'الرياض',
    phone,
    whatsapp: phone ? `966${phone.replace(/^0/, '')}` : '',
    verificationStatus: 'Pending' as const,
    verifiedAt: null as string | null,
    verificationNote: null as string | null,
    verificationRequestedAt: nowIso,
    verificationReviewedAt: null as string | null,
    yearsExperience: 3,
    specialty: 'أغنام وماعز',
    rating: 0,
    ratingCount: 0,
    totalSales: 0,
  };
}
