import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

/**
 * The Postgres-backed half of the limiter, which the sibling test file cannot
 * reach: that one points `DATABASE_URL` at a closed port on purpose, so it
 * exercises the in-process fallback.
 *
 * These need a real database. CI has one, and so does anyone running the suite
 * with `DATABASE_URL` set; everywhere else the whole file skips rather than
 * failing, because a unit suite that demands a server is a suite people stop
 * running. What it covers is the behaviour that is *only* correct in the durable
 * path — sliding windows and cross-process counting — and two regressions worth
 * naming, both measured before they were fixed:
 *
 *   - A fixed window forgot its count at the boundary, so eight login attempts
 *     either side of one instant let sixteen through against a limit of eight.
 *   - The same reset made `checkout-hold` forget reservations made just before
 *     a boundary while they were still holding stock, allowing five open holds
 *     where three is the cap.
 */
const { PrismaClient } = await import('@prisma/client');
const { rateLimitedByKey, resetRateLimits } = await import('../lib/rate-limit.ts');

const db = new PrismaClient();
let reachable = false;

before(async () => {
  try {
    await db.$queryRaw`SELECT 1`;
    await db.rateLimitCounter.deleteMany({ where: { key: { contains: ':durable-test-' } } });
    reachable = true;
  } catch {
    reachable = false;
  }
});

after(async () => {
  if (reachable) {
    await db.rateLimitCounter.deleteMany({ where: { key: { contains: ':durable-test-' } } });
  }
  await db.$disconnect();
});

/** Ages a counter's window into the past, standing in for elapsed time. */
async function rollWindow(key: string) {
  await db.rateLimitCounter.update({
    where: { key },
    data: { resetAt: new Date(Date.now() - 1000) }
  });
}

describe('durable rate limiting', () => {
  it('counts across a window boundary instead of forgetting', async (t) => {
    if (!reachable) return t.skip('no database');
    resetRateLimits();
    const caller = 'durable-test-burst';
    const options = { name: 'admin-login', limit: 8, windowMs: 15 * 60_000 };

    let beforeBoundary = 0;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (!(await rateLimitedByKey(caller, options))) beforeBoundary += 1;
    }
    await rollWindow(`admin-login:${caller}`);

    let afterBoundary = 0;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (!(await rateLimitedByKey(caller, options))) afterBoundary += 1;
    }

    assert.equal(beforeBoundary, 8, 'the window itself should allow exactly the limit');
    assert.ok(
      beforeBoundary + afterBoundary <= options.limit,
      `${beforeBoundary} + ${afterBoundary} allowed across the boundary, limit ${options.limit}`
    );
  });

  it('still refuses a fourth hold when three are open across a boundary', async (t) => {
    if (!reachable) return t.skip('no database');
    resetRateLimits();
    const caller = 'durable-test-holds';
    const options = { name: 'checkout-hold', limit: 3, windowMs: 35 * 60_000 };

    for (let hold = 0; hold < 3; hold += 1) await rateLimitedByKey(caller, options);
    await rollWindow(`checkout-hold:${caller}`);

    assert.equal(await rateLimitedByKey(caller, options), true);
  });

  it('lets the carried count decay so expired holds stop counting', async (t) => {
    if (!reachable) return t.skip('no database');
    resetRateLimits();
    const caller = 'durable-test-decay';
    const options = { name: 'checkout-hold', limit: 3, windowMs: 35 * 60_000 };

    for (let hold = 0; hold < 3; hold += 1) await rateLimitedByKey(caller, options);
    /**
     * Deep into the following window: the previous three are nearly out of view,
     * which is the point at which those holds have expired on the shelf too.
     */
    await db.rateLimitCounter.update({
      where: { key: `checkout-hold:${caller}` },
      data: { resetAt: new Date(Date.now() + 60_000), count: 0, prevCount: 3 }
    });

    assert.equal(await rateLimitedByKey(caller, options), false);
  });

  it('counts concurrent callers exactly', async (t) => {
    if (!reachable) return t.skip('no database');
    resetRateLimits();
    const caller = 'durable-test-race';
    const options = { name: 'probe', limit: 5, windowMs: 60_000 };

    const answers = await Promise.all(
      Array.from({ length: 20 }, () => rateLimitedByKey(caller, options))
    );
    assert.equal(answers.filter(Boolean).length, 15);
  });

  it('starts clean after two silent windows', async (t) => {
    if (!reachable) return t.skip('no database');
    resetRateLimits();
    const caller = 'durable-test-idle';
    const options = { name: 'probe', limit: 3, windowMs: 60_000 };

    for (let hit = 0; hit < 3; hit += 1) await rateLimitedByKey(caller, options);
    await db.rateLimitCounter.update({
      where: { key: `probe:${caller}` },
      data: { resetAt: new Date(Date.now() - 2 * options.windowMs) }
    });

    assert.equal(await rateLimitedByKey(caller, options), false);
  });
});
