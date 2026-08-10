type Bucket = number[];

const buckets = new Map<string, Bucket>();

/** Nothing is remembered longer than this, whatever an individual window asks for. */
const MAX_RETENTION_MS = 60 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;
/** Backstop against a scanner minting a fresh key per request. */
const MAX_BUCKETS = 10_000;

let lastSweep = 0;

export function clientKey(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Buckets are pruned as they age out. Without this the map grew a permanent
 * entry per client key, which on a long-running container turns broad or
 * scripted traffic into a slow memory leak.
 */
function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;

  for (const [key, hits] of buckets) {
    if (!hits.length || now - hits[hits.length - 1] >= MAX_RETENTION_MS) buckets.delete(key);
  }

  // If a flood outpaces the sweep, drop the oldest keys rather than grow forever.
  if (buckets.size > MAX_BUCKETS) {
    const overflow = buckets.size - MAX_BUCKETS;
    let removed = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      if (++removed >= overflow) break;
    }
  }
}

/**
 * A small in-process limiter. Enough to stop scripted probing of the public
 * lookup endpoints on a single-container deployment.
 */
export function rateLimited(
  request: Request,
  { name, limit, windowMs }: { name: string; limit: number; windowMs: number }
) {
  const now = Date.now();
  sweep(now);

  const key = `${name}:${clientKey(request)}`;
  const recent = (buckets.get(key) || []).filter((time) => now - time < windowMs);

  if (recent.length >= limit) {
    buckets.set(key, recent);
    return true;
  }

  recent.push(now);
  if (recent.length) buckets.set(key, recent);
  else buckets.delete(key);
  return false;
}

/** Test seam: drops all state. */
export function resetRateLimits() {
  buckets.clear();
  lastSweep = 0;
}

export function rateLimitBucketCount() {
  return buckets.size;
}
