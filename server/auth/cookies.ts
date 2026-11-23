export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (!name || name in out) continue; // first occurrence wins
    let value = part.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export interface CookieOptions {
  maxAgeMs?: number;
  secure: boolean;
  sameSite?: 'Lax' | 'Strict';
}

export function serializeSessionCookie(name: string, value: string, opts: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', `SameSite=${opts.sameSite || 'Lax'}`];
  if (opts.secure) parts.push('Secure');
  if (opts.maxAgeMs !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAgeMs / 1000))}`);
  }
  return parts.join('; ');
}

export function serializeClearCookie(name: string, secure: boolean): string {
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
