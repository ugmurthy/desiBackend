// --- In-memory sliding window rate limiter for Telegram gateway ---

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const buckets = new Map<string, Map<string, RateLimitEntry>>();

// Rate limit configurations per category
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  verification: { maxRequests: 5, windowMs: 15 * 60 * 1000 },   // 5 per 15 min
  command: { maxRequests: 30, windowMs: 60 * 1000 },             // 30 per min
  request_submission: { maxRequests: 10, windowMs: 60 * 1000 },  // 10 per min
  webhook: { maxRequests: 60, windowMs: 60 * 1000 },             // 60 per min per chat
};

function getBucket(category: string): Map<string, RateLimitEntry> {
  let bucket = buckets.get(category);
  if (!bucket) {
    bucket = new Map();
    buckets.set(category, bucket);
  }
  return bucket;
}

function cleanExpired(entry: RateLimitEntry, windowMs: number, now: number): void {
  const cutoff = now - windowMs;
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

/**
 * Check and consume a rate limit token for a given category and key.
 * Returns whether the request is allowed.
 */
export function checkRateLimit(
  category: string,
  key: string
): RateLimitResult {
  const config = RATE_LIMITS[category];
  if (!config) {
    return { allowed: true, remaining: Infinity };
  }

  const bucket = getBucket(category);
  const now = Date.now();

  let entry = bucket.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    bucket.set(key, entry);
  }

  cleanExpired(entry, config.windowMs, now);

  if (entry.timestamps.length >= config.maxRequests) {
    const oldestInWindow = entry.timestamps[0]!;
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 0),
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
  };
}

/**
 * Reset rate limit state for testing purposes.
 */
export function resetRateLimits(): void {
  buckets.clear();
}
