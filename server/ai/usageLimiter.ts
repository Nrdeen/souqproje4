import { RateLimiter } from '../auth/rateLimit';
import type { AiUsageSnapshot } from './types';

export interface AiUsageLimiterOptions {
  rateLimitPerMinute: number;
  dailyUserQuota: number;
  dailyIpQuota: number;
  now?: () => number;
}

export interface AiConsumeResult {
  allowed: boolean;
  reason?: 'rate_limited' | 'daily_quota_exceeded';
  retryAfterSeconds: number;
  usage: AiUsageSnapshot;
}

interface DailyCounter {
  dayKey: string;
  count: number;
}

function utcDayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function nextUtcMidnightIso(ts: number): string {
  const d = new Date(ts);
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

export class AiUsageLimiter {
  private readonly minuteLimiter: RateLimiter;
  private readonly dailyCounters = new Map<string, DailyCounter>();
  private readonly now: () => number;
  private readonly dailyUserQuota: number;
  private readonly dailyIpQuota: number;

  constructor(opts: AiUsageLimiterOptions) {
    this.now = opts.now || Date.now;
    this.dailyUserQuota = opts.dailyUserQuota;
    this.dailyIpQuota = opts.dailyIpQuota;
    this.minuteLimiter = new RateLimiter({
      max: opts.rateLimitPerMinute,
      windowMs: 60_000,
      now: this.now,
    });
  }

  private getKeyAndLimit(actorKey: string, isAuthenticated: boolean): { key: string; limit: number } {
    return {
      key: isAuthenticated ? `usr:${actorKey}` : `ip:${actorKey}`,
      limit: isAuthenticated ? this.dailyUserQuota : this.dailyIpQuota,
    };
  }

  private getTodayCount(scopedKey: string, ts: number): number {
    const dayKey = utcDayKey(ts);
    const entry = this.dailyCounters.get(scopedKey);
    if (!entry || entry.dayKey !== dayKey) return 0;
    return entry.count;
  }

  peek(actorKey: string, isAuthenticated: boolean): AiUsageSnapshot {
    const ts = this.now();
    const { key, limit } = this.getKeyAndLimit(actorKey, isAuthenticated);
    const usedToday = this.getTodayCount(key, ts);
    return {
      usedToday,
      dailyLimit: limit,
      remainingToday: Math.max(0, limit - usedToday),
      resetAtIso: nextUtcMidnightIso(ts),
    };
  }

  consume(actorKey: string, isAuthenticated: boolean): AiConsumeResult {
    const ts = this.now();
    const { key, limit } = this.getKeyAndLimit(actorKey, isAuthenticated);
    const dayKey = utcDayKey(ts);
    const resetAtIso = nextUtcMidnightIso(ts);

    const usedBefore = this.getTodayCount(key, ts);
    if (usedBefore >= limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((Date.parse(resetAtIso) - ts) / 1000)
      );
      return {
        allowed: false,
        reason: 'daily_quota_exceeded',
        retryAfterSeconds,
        usage: {
          usedToday: usedBefore,
          dailyLimit: limit,
          remainingToday: 0,
          resetAtIso,
        },
      };
    }

    const minuteCheck = this.minuteLimiter.consume(key);
    if (!minuteCheck.allowed) {
      return {
        allowed: false,
        reason: 'rate_limited',
        retryAfterSeconds: Math.max(1, Math.ceil(minuteCheck.retryAfterMs / 1000)),
        usage: {
          usedToday: usedBefore,
          dailyLimit: limit,
          remainingToday: Math.max(0, limit - usedBefore),
          resetAtIso,
        },
      };
    }

    if (this.dailyCounters.size > 20_000) {
      for (const [k, v] of this.dailyCounters) {
        if (v.dayKey !== dayKey) this.dailyCounters.delete(k);
      }
    }

    const nextCount = usedBefore + 1;
    this.dailyCounters.set(key, { dayKey, count: nextCount });

    return {
      allowed: true,
      retryAfterSeconds: 0,
      usage: {
        usedToday: nextCount,
        dailyLimit: limit,
        remainingToday: Math.max(0, limit - nextCount),
        resetAtIso,
      },
    };
  }
}
