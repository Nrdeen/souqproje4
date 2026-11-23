import type { AppConfig } from './config';
import { parseCookies } from './auth/cookies';
import { isAllowedOrigin } from './auth/csrf';
import type { SessionManager } from './auth/sessions';

export type UpgradeAuthResult =
  | { ok: true; userId: string; sessionId: string }
  | { ok: false; status: 401 | 403 };

/**
 * Decides whether a WebSocket handshake may proceed. Identity comes ONLY from the session cookie;
 * the Origin must be on the allow-list. Pure function so it can be unit-tested without sockets.
 */
export function authenticateUpgrade(
  headers: { origin?: string; cookie?: string },
  deps: {
    config: Pick<AppConfig, 'allowedOrigins' | 'cookieName'>;
    sessions: Pick<SessionManager, 'validate'>;
    findUser: (id: string) => { id: string; status?: string } | undefined;
  }
): UpgradeAuthResult {
  if (!isAllowedOrigin(headers.origin, deps.config.allowedOrigins)) return { ok: false, status: 403 };
  const token = parseCookies(headers.cookie)[deps.config.cookieName];
  const session = deps.sessions.validate(token);
  if (!session) return { ok: false, status: 401 };
  const user = deps.findUser(session.userId);
  if (!user || user.status !== 'active') return { ok: false, status: 401 };
  return { ok: true, userId: user.id, sessionId: session.id };
}

export async function authenticateUpgradeAsync(
  headers: { origin?: string; cookie?: string },
  deps: {
    config: Pick<AppConfig, 'allowedOrigins' | 'cookieName'>;
    validateSession: (token: string | undefined) => Promise<{ id: string; userId: string } | null>;
    findUser: (id: string) => Promise<{ id: string; status?: string } | undefined>;
  }
): Promise<UpgradeAuthResult> {
  if (!isAllowedOrigin(headers.origin, deps.config.allowedOrigins)) return { ok: false, status: 403 };
  const token = parseCookies(headers.cookie)[deps.config.cookieName];
  if (!token) return { ok: false, status: 401 };
  const session = await deps.validateSession(token);
  if (!session) return { ok: false, status: 401 };
  const user = await deps.findUser(session.userId);
  if (!user || user.status !== 'active') return { ok: false, status: 401 };
  return { ok: true, userId: user.id, sessionId: session.id };
}
