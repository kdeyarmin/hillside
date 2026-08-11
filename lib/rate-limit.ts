import crypto from 'crypto';

type Bucket = number[];

const buckets = new Map<string, Bucket>();

/** Nothing is remembered longer than this, whatever an individual window asks for. */
const MAX_RETENTION_MS = 60 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;
/** Backstop against a scanner minting a fresh key per request. */
const MAX_BUCKETS = 10_000;

let lastSweep = 0;

/**
 * How many proxies sit in front of this app and can be trusted to have appended
 * an honest entry to `X-Forwarded-For`. On Railway that is the single edge proxy.
 */
function trustedProxyHops() {
  const configured = Number(process.env.TRUSTED_PROXY_HOPS);
  return Number.isFinite(configured) && configured >= 1 ? Math.floor(configured) : 1;
}

/**
 * Identifies the caller for rate-limiting purposes.
 *
 * This used to take the *first* `X-Forwarded-For` entry, which is the least
 * trustworthy one. Proxies append, so the leftmost value is whatever the client
 * sent — a caller supplying `X-Forwarded-For: 1.2.3.4` had that used verbatim and
 * could defeat every limit on the site by rotating the header, including the
 * order-status limit that is the only thing standing between an attacker and
 * invoice-number enumeration.
 *
 * Counting from the right instead: with one trusted proxy in front of us, the
 * rightmost entry is the address that proxy saw the connection come from, which
 * is the real client. Anything further left is client-supplied and ignored.
 */
export function clientKey(request: Request) {
  const chain = (request.headers.get('x-forwarded-for') || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (chain.length) {
    const index = Math.max(0, chain.length - trustedProxyHops());
    return chain[index];
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  /**
   * No forwarding headers at all — direct connections, or local development.
   * A single literal fallback would put every such caller in one shared bucket,
   * so one script could lock every other visitor out of the contact form. This
   * is a weak discriminator rather than an identity, but it keeps unrelated
   * callers apart without switching the limiter off.
   */
  const fingerprint = `${request.headers.get('user-agent') || ''}|${request.headers.get('accept-language') || ''}`;
  return `anon:${crypto.createHash('sha256').update(fingerprint).digest('base64url').slice(0, 16)}`;
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
 * endpoints on a single-container deployment.
 *
 * Deliberately in-process, and that has consequences worth knowing before
 * relying on it: the counters live in this process's memory, so they reset on
 * every deploy and restart, and a deployment running N replicas allows roughly
 * N times each limit because each replica counts only what it sees. That is an
 * accepted trade for the single Railway container this runs on today. Moving to
 * more than one replica means moving this state to Redis — the call sites will
 * not need to change, only this file.
 */
export function rateLimited(
  request: Request,
  options: { name: string; limit: number; windowMs: number }
) {
  return rateLimitedByKey(clientKey(request), options);
}

/**
 * The same limiter addressed by a caller-supplied identity, for contexts with no
 * `Request` to read — server actions, which reach their headers through
 * `next/headers` instead.
 */
export function rateLimitedByKey(
  identity: string,
  { name, limit, windowMs }: { name: string; limit: number; windowMs: number }
) {
  const now = Date.now();
  sweep(now);

  const key = `${name}:${identity}`;
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
