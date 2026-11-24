/** Whitelist serializers: a field must be listed here to ever leave the server. */

export function toSelfUser(
  user: any,
  meta?: { googleLinked?: boolean; facebookLinked?: boolean; hasPassword?: boolean }
) {
  if (!user) return null;
  const phone = typeof user.phone === 'string' && user.phone.trim() ? user.phone.trim() : null;
  return {
    id: user.id,
    phone,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    phoneVerified: Boolean(user.phoneVerifiedAt),
    needsPhoneCompletion: !phone,
    ...(typeof meta?.googleLinked === 'boolean' ? { googleLinked: meta.googleLinked } : {}),
    ...(typeof meta?.facebookLinked === 'boolean' ? { facebookLinked: meta.facebookLinked } : {}),
    ...(typeof meta?.hasPassword === 'boolean' ? { hasPassword: meta.hasPassword } : {}),
  };
}

/** Public seller card. Private contact details (phone/whatsapp) are never serialized in public/bootstrap payloads. */
export function toPublicSeller(seller: any, contactAvailable?: boolean) {
  const verificationStatus: 'Pending' | 'Verified' | 'Rejected' =
    seller.verificationStatus === 'Verified' ||
    (!seller.verificationStatus && Boolean(seller.verifiedAt))
      ? 'Verified'
      : seller.verificationStatus === 'Rejected'
      ? 'Rejected'
      : 'Pending';
  const verifiedAt = verificationStatus === 'Verified' ? seller.verifiedAt || null : null;

  return {
    userId: seller.userId,
    displayName: seller.displayName,
    bio: seller.bio,
    regionId: seller.regionId,
    city: seller.city,
    verificationStatus,
    verifiedAt,
    yearsExperience: seller.yearsExperience,
    specialty: seller.specialty,
    rating: seller.rating,
    ratingCount: seller.ratingCount,
    totalSales: seller.totalSales,
    contactAvailable:
      typeof contactAvailable === 'boolean'
        ? contactAvailable
        : Boolean(seller.phone || seller.whatsapp),
  };
}

/** Minimal {id,name} directory entry for the other side of a conversation or offer. */
export function toDirectoryEntry(user: any) {
  return { id: user.id, name: user.name };
}
