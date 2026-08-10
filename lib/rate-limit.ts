type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

export function clientKey(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

/**
 * A small in-process limiter. Enough to stop scripted probing of the public
 * lookup endpoints on a single-container deployment.
 */
export function rateLimited(
  request: Request,
  { name, limit, windowMs }: { name: string; limit: number; windowMs: number }
) {
  const key = `${name}:${clientKey(request)}`;
  const now = Date.now();
  const recent = (buckets.get(key)?.hits || []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, { hits: recent });
    return true;
  }
  recent.push(now);
  buckets.set(key, { hits: recent });
  return false;
}
