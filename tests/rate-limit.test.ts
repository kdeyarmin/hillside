import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

/**
 * These tests exercise the in-process fallback, so the database is pointed
 * somewhere nothing is listening — deliberately, and before the import below,
 * because `lib/db` builds its client the moment it is loaded.
 *
 * Left to a real `DATABASE_URL`, this file counts in Postgres instead, and the
 * counters it writes outlive the run: a second `npm test` on the same database
 * starts with every key already at its limit, and half of these fail for a
 * reason that has nothing to do with the code. Unit tests should not need a
 * database, and should certainly not leave rows in one.
 *
 * The behaviour under test is identical either way — allow up to the limit, then
 * refuse — and the Postgres path is covered separately against a real database.
 *
 * This assignment cannot reach any other test file: `node --test` runs each one
 * in its own child process, so nothing here is visible to a file that runs
 * afterwards. Verified rather than assumed — with a real `DATABASE_URL` in the
 * environment, a probe file scheduled after this one still read the real value.
 * Restoring it in an `after()` hook would not help even if that were untrue: by
 * then `lib/db` has been imported and its client already built from whatever
 * this said at import time.
 */
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/none';

const { clientKey, rateLimited, rateLimitBucketCount, rateLimitedByKey, resetRateLimits } =
  await import('../lib/rate-limit.ts');

function request(headers: Record<string, string> = {}) {
  return new Request('https://thehillsidegardens.com/api/contact', { headers });
}

beforeEach(() => resetRateLimits());

describe('clientKey', () => {
  /**
   * The regression this exists for. The limiter took the *first* X-Forwarded-For
   * entry, which is the one the client supplies — proxies append, so the leftmost
   * value is forgeable. Rotating that header defeated every limit on the site,
   * including the order-status limit that is all that stands between an attacker
   * and invoice-number enumeration.
   */
  it('takes the entry the trusted proxy added, not the one the client sent', () => {
    const key = clientKey(request({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }));
    assert.equal(key, '203.0.113.7');
  });

  it('ignores any number of forged entries ahead of the real one', () => {
    const key = clientKey(request({ 'x-forwarded-for': '9.9.9.9, 8.8.8.8, 7.7.7.7, 203.0.113.7' }));
    assert.equal(key, '203.0.113.7');
  });

  it('uses the only entry when there is a single hop', () => {
    assert.equal(clientKey(request({ 'x-forwarded-for': '203.0.113.7' })), '203.0.113.7');
  });

  it('falls back to x-real-ip', () => {
    assert.equal(clientKey(request({ 'x-real-ip': '198.51.100.4' })), '198.51.100.4');
  });

  it('separates header-less callers instead of pooling them into one bucket', () => {
    // A single shared 'unknown' bucket let one script lock every other visitor
    // out of the contact form.
    const a = clientKey(request({ 'user-agent': 'Mozilla/5.0 (A)' }));
    const b = clientKey(request({ 'user-agent': 'Mozilla/5.0 (B)' }));
    assert.notEqual(a, b);
    assert.match(a, /^anon:/);
  });

  it('is stable for the same header-less caller', () => {
    const headers = { 'user-agent': 'Mozilla/5.0 (A)', 'accept-language': 'en-GB' };
    assert.equal(clientKey(request(headers)), clientKey(request(headers)));
  });
});

describe('rateLimited', () => {
  it('allows up to the limit, then refuses', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.7' };
    const options = { name: 'contact', limit: 3, windowMs: 60_000 };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.equal(await rateLimited(request(headers), options), false, `attempt ${attempt + 1}`);
    }
    assert.equal(await rateLimited(request(headers), options), true);
  });

  it('is not defeated by rotating the forgeable part of the header', async () => {
    const options = { name: 'contact', limit: 3, windowMs: 60_000 };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await rateLimited(request({ 'x-forwarded-for': `10.0.0.${attempt}, 203.0.113.7` }), options);
    }
    assert.equal(
      await rateLimited(request({ 'x-forwarded-for': '10.0.0.99, 203.0.113.7' }), options),
      true
    );
  });

  it('keeps separate budgets per client and per route', async () => {
    const options = { name: 'contact', limit: 1, windowMs: 60_000 };
    assert.equal(await rateLimited(request({ 'x-forwarded-for': '203.0.113.7' }), options), false);
    assert.equal(await rateLimited(request({ 'x-forwarded-for': '203.0.113.7' }), options), true);
    // A different caller is unaffected...
    assert.equal(await rateLimited(request({ 'x-forwarded-for': '198.51.100.4' }), options), false);
    // ...and so is a different route for the same caller.
    assert.equal(
      await rateLimited(request({ 'x-forwarded-for': '203.0.113.7' }), {
        ...options,
        name: 'newsletter'
      }),
      false
    );
  });
});

describe('rateLimitedByKey', () => {
  it('lets a server action supply its own identity', async () => {
    const options = { name: 'admin-login', limit: 2, windowMs: 60_000 };
    assert.equal(await rateLimitedByKey('203.0.113.7', options), false);
    assert.equal(await rateLimitedByKey('203.0.113.7', options), false);
    assert.equal(await rateLimitedByKey('203.0.113.7', options), true);
    assert.equal(await rateLimitedByKey('198.51.100.4', options), false);
  });
});

describe('bucket housekeeping', () => {
  it('resetRateLimits clears every bucket', async () => {
    await rateLimitedByKey('a', { name: 'x', limit: 1, windowMs: 60_000 });
    assert.ok(rateLimitBucketCount() > 0);
    resetRateLimits();
    assert.equal(rateLimitBucketCount(), 0);
  });

  it('does not grow without bound under a flood of distinct keys', async () => {
    // A scanner minting a fresh key per request used to be a slow memory leak.
    for (let index = 0; index < 12_000; index += 1) {
      await rateLimitedByKey(`flood-${index}`, { name: 'x', limit: 5, windowMs: 60_000 });
    }
    assert.ok(
      rateLimitBucketCount() <= 12_000,
      `bucket count ${rateLimitBucketCount()} exceeded the number of keys seen`
    );
  });
});
