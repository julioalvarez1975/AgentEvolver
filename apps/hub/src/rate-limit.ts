/**
 * Tiny in-memory sliding window for join / sensitive HTTP endpoints.
 * Not a substitute for a reverse proxy — enough for LAN-facing hub.
 */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export function rateLimitAllow(options: {
  key: string;
  limit: number;
  windowMs: number;
}): boolean {
  const now = Date.now();
  const windowStart = now - options.windowMs;
  let bucket = buckets.get(options.key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(options.key, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter((t) => t >= windowStart);
  if (bucket.timestamps.length >= options.limit) {
    return false;
  }
  bucket.timestamps.push(now);
  return true;
}

/** Best-effort client IP from Node/Hono request headers. */
export function clientIpFromHeaders(
  header: (name: string) => string | undefined,
): string {
  const forwarded = header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const real = header("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}
