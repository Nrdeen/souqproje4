import crypto from 'node:crypto';

export interface SessionRecord {
  /** SHA-256 (hex) of the opaque cookie token. The raw token is never stored. */
  id: string;
  userId: string;
  createdAt: number;
  lastSeenAt: number;
  /** Absolute expiry; the session can never outlive it, even if kept active. */
  expiresAt: number;
  ip?: string;
  userAgent?: string;
}

export interface SessionManagerOptions {
  getSessions: () => SessionRecord[];
  setSessions: (list: SessionRecord[]) => void;
  persist: () => void;
  /** Optional coalesced persistence for frequent non-critical lastSeenAt touches. Defaults to persist(). */
  persistTouch?: () => void;
  idleMs: number;
  absoluteMs: number;
  maxPerUser: number;
  now?: () => number;
  onRevoked?: (sessionIds: string[]) => void;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const TOUCH_INTERVAL_MS = 60_000;

export class SessionManager {
  private readonly now: () => number;

  constructor(private readonly opts: SessionManagerOptions) {
    this.now = opts.now || Date.now;
  }

  create(userId: string, meta: { ip?: string; userAgent?: string } = {}) {
    const token = crypto.randomBytes(32).toString('base64url');
    const t = this.now();
    const session: SessionRecord = {
      id: hashToken(token),
      userId,
      createdAt: t,
      lastSeenAt: t,
      expiresAt: t + this.opts.absoluteMs,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 200),
    };
    const list = this.opts.getSessions();
    list.push(session);

    // Cap concurrent sessions per user: drop the oldest ones.
    const mine = list.filter((s) => s.userId === userId).sort((a, b) => a.lastSeenAt - b.lastSeenAt);
    const overflow = mine.length - this.opts.maxPerUser;
    if (overflow > 0) {
      const drop = new Set(mine.slice(0, overflow).map((s) => s.id));
      this.opts.setSessions(this.opts.getSessions().filter((s) => !drop.has(s.id)));
      this.opts.onRevoked?.([...drop]);
    }
    this.opts.persist();
    return { token, session };
  }

  /** Returns the live session for a raw cookie token, or null if unknown/expired/idle. */
  validate(token: string | undefined): SessionRecord | null {
    if (!token || token.length < 20 || token.length > 200) return null;
    const id = hashToken(token);
    const session = this.opts.getSessions().find((s) => s.id === id);
    if (!session) return null;
    const t = this.now();
    if (t >= session.expiresAt || t - session.lastSeenAt >= this.opts.idleMs) {
      this.revoke(session.id);
      return null;
    }
    if (t - session.lastSeenAt >= TOUCH_INTERVAL_MS) {
      session.lastSeenAt = t;
      (this.opts.persistTouch || this.opts.persist)();
    }
    return session;
  }

  /** Same checks as validate() but never mutates state (used by long-lived WebSocket heartbeats). */
  isAlive(sessionId: string): boolean {
    const session = this.opts.getSessions().find((s) => s.id === sessionId);
    if (!session) return false;
    const t = this.now();
    return t < session.expiresAt && t - session.lastSeenAt < this.opts.idleMs;
  }

  revoke(sessionId: string): boolean {
    const before = this.opts.getSessions();
    const next = before.filter((s) => s.id !== sessionId);
    if (next.length === before.length) return false;
    this.opts.setSessions(next);
    this.opts.persist();
    this.opts.onRevoked?.([sessionId]);
    return true;
  }

  revokeAllForUser(userId: string, exceptId?: string): number {
    const before = this.opts.getSessions();
    const dropped = before.filter((s) => s.userId === userId && s.id !== exceptId).map((s) => s.id);
    if (dropped.length === 0) return 0;
    const drop = new Set(dropped);
    this.opts.setSessions(before.filter((s) => !drop.has(s.id)));
    this.opts.persist();
    this.opts.onRevoked?.(dropped);
    return dropped.length;
  }

  /** Removes expired / idle sessions. Returns how many were removed. */
  sweep(): number {
    const t = this.now();
    const before = this.opts.getSessions();
    const dead = before.filter((s) => t >= s.expiresAt || t - s.lastSeenAt >= this.opts.idleMs).map((s) => s.id);
    if (dead.length === 0) return 0;
    const drop = new Set(dead);
    this.opts.setSessions(before.filter((s) => !drop.has(s.id)));
    this.opts.persist();
    this.opts.onRevoked?.(dead);
    return dead.length;
  }
}
