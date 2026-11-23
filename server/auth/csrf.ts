import crypto from 'node:crypto';

/** CSRF token bound to one session: HMAC(secret, sessionId). Useless to an attacker without the secret. */
export function csrfTokenFor(sessionId: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`csrf:${sessionId}`).digest('base64url');
}

export function verifyCsrfToken(sessionId: string, provided: unknown, secret: string): boolean {
  if (typeof provided !== 'string' || provided.length === 0 || provided.length > 200) return false;
  const expected = Buffer.from(csrfTokenFor(sessionId, secret));
  const actual = Buffer.from(provided);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function isAllowedOrigin(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.includes(origin);
}

export interface OriginCheckInput {
  origin?: string;
  referer?: string;
  secFetchSite?: string;
}

/**
 * Validates where a state-changing browser request came from.
 * Order: explicit cross-site signal -> Origin -> Referer. A request with neither header is rejected.
 */
export function checkMutationOrigin(input: OriginCheckInput, allowed: string[]): { ok: boolean; reason?: string } {
  if (input.secFetchSite === 'cross-site') return { ok: false, reason: 'cross-site request' };
  if (input.origin && input.origin !== 'null') {
    return isAllowedOrigin(input.origin, allowed) ? { ok: true } : { ok: false, reason: 'origin not allowed' };
  }
  if (input.referer) {
    try {
      const refOrigin = new URL(input.referer).origin;
      return isAllowedOrigin(refOrigin, allowed) ? { ok: true } : { ok: false, reason: 'referer not allowed' };
    } catch {
      return { ok: false, reason: 'invalid referer' };
    }
  }
  return { ok: false, reason: 'missing origin' };
}
