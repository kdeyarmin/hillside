import crypto from 'crypto';
// Relative and extensioned rather than the usual `@/lib/db`: `npm test` runs
// these modules through node directly, which resolves neither tsconfig path
// aliases nor extensionless files.
import { db } from './db.ts';

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

type HeaderReader = { get(name: string): string | null };

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
export function clientKeyFromHeaders(headers: HeaderReader) {
  const chain = (headers.get('x-forwarded-for') || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (chain.length) {
    const index = Math.max(0, chain.length - trustedProxyHops());
    return chain[index];
  }

  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  /**
   * No forwarding headers at all — direct connections, or local development.
   * A single literal fallback would put every such caller in one shared bucket,
   * so one script could lock every other visitor out of the contact form. This
   * is a weak discriminator rather than an identity, but it keeps unrelated
   * callers apart without switching the limiter off.
   */
  const fingerprint = `${headers.get('user-agent') || ''}|${headers.get('accept-language') || ''}`;
  return `anon:${crypto.createHash('sha256').update(fingerprint).digest('base64url').slice(0, 16)}`;
}

export function clientKey(request: Request) {
  return clientKeyFromHeaders(request.headers);
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
 * The in-process counter, kept as the fallback rather than the mechanism.
 *
 * Its limits are real but weak: they reset on every deploy, a second replica
 * counts only what it sees, and a caller minting fresh keys can push older
 * buckets out of the map. That is why the durable counter below exists — this
 * one is what answers when the database cannot be reached, because a shop whose
 * database is briefly unavailable should still refuse a flood rather than open
 * every form to it.
 */
function inProcessLimited(key: string, { limit, windowMs }: { limit: number; windowMs: number }) {
  const now = Date.now();
  sweep(now);

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

/**
 * Bumps a shared counter and says whether this caller has now gone over.
 *
 * A fixed window rather than the sliding one the in-process limiter used: it is
 * one statement, and it cannot be raced, which a read-then-write pair very much
 * can. `resetAt` in the past means the previous window has ended, so the same
 * row is reused with the count restarted — no separate expiry pass is needed for
 * correctness, only the housekeeping sweep further down.
 *
 * The comparison is `>` rather than `>=` because the insert has already counted
 * this request: a limit of 8 must allow the eighth attempt and refuse the ninth.
 */
async function durableLimited(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitCounter" ("key", "count", "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimitCounter"."resetAt" <= ${now}
                       THEN 1 ELSE "RateLimitCounter"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitCounter"."resetAt" <= ${now}
                       THEN ${resetAt} ELSE "RateLimitCounter"."resetAt" END
    RETURNING "count"
  `;

  if ((rows[0]?.count ?? 1) <= limit) return false;

  /**
   * Refused — and its own increment is taken back, so the column counts
   * requests that were *allowed* rather than requests that were made.
   *
   * The distinction matters wherever a limit stands for something outstanding
   * rather than something spent. `checkout-hold` allows three open inventory
   * holds; if refused attempts kept climbing, giving an attempt back when a hold
   * is released would not get the customer under the ceiling again, because the
   * counter would be sitting above it. It also means a caller who keeps knocking
   * cannot push their own window further out.
   *
   * The increment still had to happen first: doing the check and the increment
   * as one statement is what makes concurrent requests count correctly, and a
   * decrement afterwards leaves exactly the same total as never having counted.
   */
  await db.$executeRaw`
    UPDATE "RateLimitCounter"
       SET "count" = GREATEST(0, "count" - 1)
     WHERE "key" = ${key} AND "resetAt" > ${now}
  `;
  return true;
}

/**
 * Counters older than this are deleted opportunistically. Nothing depends on it
 * — an expired row is reused in place — it only keeps the table from growing a
 * permanent entry per caller the shop has ever had.
 */
const COUNTER_SWEEP_INTERVAL_MS = 10 * 60_000;
let lastCounterSweep = 0;

async function sweepDurableCounters() {
  const now = Date.now();
  if (now - lastCounterSweep < COUNTER_SWEEP_INTERVAL_MS) return;
  lastCounterSweep = now;
  try {
    await db.rateLimitCounter.deleteMany({
      where: { resetAt: { lt: new Date(now - MAX_RETENTION_MS) } }
    });
  } catch {
    // Housekeeping only. A failure here costs nothing that matters this request.
  }
}

/**
 * Whether this request has exhausted the named limit.
 *
 * Counted in Postgres, so the limit holds across deploys, restarts and replicas
 * — which is what makes it worth anything on the admin login, where the previous
 * in-process counter reset every time the shop was deployed.
 *
 * If the database cannot be reached the in-process counter answers instead. That
 * is deliberately fail-*closed-ish* rather than fail-open: a weak limit is worth
 * more than none, and the alternative — refusing every request outright — would
 * turn a database blip into an outage of the contact form.
 */
export async function rateLimited(
  request: Request,
  options: { name: string; limit: number; windowMs: number }
) {
  return rateLimitedByKey(clientKey(request), options);
}

/**
 * The same limiter addressed by a caller-supplied identity, for contexts with no
 * `Request` to read — server actions, which reach their headers through
 * `next/headers` instead, and per-account limits keyed on an email address.
 */
export async function rateLimitedByKey(
  identity: string,
  { name, limit, windowMs }: { name: string; limit: number; windowMs: number }
) {
  const key = `${name}:${identity}`;

  // The database was unreachable a moment ago. Adding a failing round trip to
  // every limited request would turn one outage into a slow site, so the
  // in-process counter answers until it is worth trying again.
  if (Date.now() < durableUnavailableUntil) {
    return inProcessLimited(key, { limit, windowMs });
  }

  try {
    void sweepDurableCounters();
    const answer = await durableLimited(key, { limit, windowMs });
    durableUnavailableUntil = 0;
    return answer;
  } catch (error) {
    durableUnavailableUntil = Date.now() + DURABLE_RETRY_DELAY_MS;
    /**
     * Once per outage, not once per request. A database that has gone away
     * takes every limit on the site down this path at once, and a log line per
     * request would bury the outage that caused it.
     */
    if (!warnedAboutDurableCounters) {
      warnedAboutDurableCounters = true;
      console.error('Rate limits are being counted in memory: the database is unreachable', error);
    }
    return inProcessLimited(key, { limit, windowMs });
  }
}

/** How long to stay on the in-process counter after the database refused. */
const DURABLE_RETRY_DELAY_MS = 30_000;
let durableUnavailableUntil = 0;
let warnedAboutDurableCounters = false;

/**
 * Gives one attempt back, for a limit that counts *open* things rather than
 * requests.
 *
 * The checkout-hold limit is the case this exists for. It allows three
 * reservations per 35 minutes, which is the length of an inventory hold — but it
 * counted every reservation ever started in that window, including the ones the
 * customer had already cancelled and whose stock was back on the shelf. Somebody
 * genuinely undecided, opening checkout and coming back to change something
 * three times, was then refused a fourth with nothing of theirs held at all.
 *
 * Called when the thing being counted is given up, so the budget tracks what is
 * actually outstanding. Never drops below zero, and never extends the window: it
 * is a refund, not a reset.
 */
export async function refundRateLimit(request: Request, { name }: { name: string }) {
  const key = `${name}:${clientKey(request)}`;

  const hits = buckets.get(key);
  if (hits?.length) hits.pop();

  if (Date.now() < durableUnavailableUntil) return;
  try {
    await db.$executeRaw`
      UPDATE "RateLimitCounter"
         SET "count" = GREATEST(0, "count" - 1)
       WHERE "key" = ${key} AND "resetAt" > ${new Date()}
    `;
  } catch {
    // The in-process refund above already happened; a limit that stays one
    // attempt stricter than it should be is not worth failing a request over.
  }
}

/** Test seam: drops the in-process state. */
export function resetRateLimits() {
  buckets.clear();
  lastSweep = 0;
  lastCounterSweep = 0;
  durableUnavailableUntil = 0;
  warnedAboutDurableCounters = false;
}

export function rateLimitBucketCount() {
  return buckets.size;
}
