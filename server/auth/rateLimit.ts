export interface RateLimiterOptions {
  max: number;
  windowMs: number;
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Fixed-window counter keyed by an arbitrary string. In-memory: use a shared store if you run several instances. */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;

  constructor(private readonly opts: RateLimiterOptions) {
    this.now = opts.now || Date.now;
  }

  private bucket(key: string): Bucket | undefined {
    const b = this.buckets.get(key);
    if (b && b.resetAt <= this.now()) {
      this.buckets.delete(key);
      return undefined;
    }
    return b;
  }

  /** Is the key currently blocked? Does not count. */
  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const b = this.bucket(key);
    if (b && b.count >= this.opts.max) {
      return { allowed: false, retryAfterMs: b.resetAt - this.now() };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Records one event (e.g. a failed login). */
  hit(key: string): void {
    if (this.buckets.size > 20_000) this.prune();
    const b = this.bucket(key);
    if (b) b.count += 1;
    else this.buckets.set(key, { count: 1, resetAt: this.now() + this.opts.windowMs });
  }

  /** check + hit in one step; returns allowed=false (without counting) if already over the limit. */
  consume(key: string): { allowed: boolean; retryAfterMs: number } {
    const state = this.check(key);
    if (state.allowed) this.hit(key);
    return state;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private prune(): void {
    const t = this.now();
    for (const [k, b] of this.buckets) if (b.resetAt <= t) this.buckets.delete(k);
  }
}
