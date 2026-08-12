import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.CLASS_ACCESS_SECRET ||= 'test-class-access-secret-long-enough-to-be-real';

const {
  classAccessCookieName,
  createClassAccessCookie,
  createClassJoinCredential,
  hashClassJoinToken,
  verifyClassAccessCookie
} = await import('../lib/class-access.ts');

const EVENT = 'evt_123';
const REGISTRATION = 'reg_456';

function cookieFor(expiresAt = new Date(Date.now() + 60 * 60_000), tokenHash = 'hash-abc') {
  return createClassAccessCookie(EVENT, REGISTRATION, tokenHash, expiresAt);
}

describe('join credentials', () => {
  it('issues a high-entropy token and stores only its hash', () => {
    const { token, hash } = createClassJoinCredential();
    // 32 random bytes, base64url.
    assert.ok(token.length >= 42, `token too short: ${token.length}`);
    assert.equal(hash, hashClassJoinToken(token));
    assert.notEqual(hash, token);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  it('never repeats a token', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => createClassJoinCredential().token));
    assert.equal(tokens.size, 500);
  });

  it('hashes deterministically, so a link can be looked up by hash', () => {
    assert.equal(hashClassJoinToken('abc'), hashClassJoinToken('abc'));
    assert.notEqual(hashClassJoinToken('abc'), hashClassJoinToken('abd'));
  });
});

describe('access cookie', () => {
  it('is namespaced per class', () => {
    assert.equal(classAccessCookieName(EVENT), `hillside-class-access-${EVENT}`);
    assert.notEqual(classAccessCookieName('a'), classAccessCookieName('b'));
  });

  it('round-trips the registration and token hash', () => {
    const access = verifyClassAccessCookie(cookieFor(), EVENT);
    assert.ok(access, 'expected a valid cookie to verify');
    assert.equal(access.registrationId, REGISTRATION);
    assert.equal(access.tokenHash, 'hash-abc');
  });

  it('refuses a cookie presented for a different class', () => {
    assert.equal(verifyClassAccessCookie(cookieFor(), 'evt_other'), null);
  });

  it('refuses an expired cookie', () => {
    const expired = cookieFor(new Date(Date.now() - 1000));
    assert.equal(verifyClassAccessCookie(expired, EVENT), null);
  });

  it('refuses a tampered payload', () => {
    const cookie = cookieFor();
    const [payload, signature] = cookie.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        eventId: EVENT,
        registrationId: 'reg_someone_else',
        tokenHash: 'hash-abc',
        exp: Date.now() + 60_000
      })
    ).toString('base64url');
    assert.notEqual(forged, payload);
    assert.equal(verifyClassAccessCookie(`${forged}.${signature}`, EVENT), null);
  });

  it('refuses a tampered signature', () => {
    const [payload, signature] = cookieFor().split('.');
    const flipped = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');
    assert.equal(verifyClassAccessCookie(`${payload}.${flipped}`, EVENT), null);
  });

  it('refuses malformed and empty values without throwing', () => {
    for (const value of ['', 'nonsense', 'a.b', '...', undefined]) {
      assert.equal(verifyClassAccessCookie(value, EVENT), null);
    }
  });

  /**
   * The cookie is bound to the token hash so that rotating a customer's join token
   * invalidates any cookie already issued against the old one. That binding is why
   * the webhook must not mint a fresh credential on a replayed Stripe event — doing
   * so locked customers out of a class they had paid for.
   */
  it('carries the token hash it was bound to, so a rotated token invalidates it', () => {
    const access = verifyClassAccessCookie(cookieFor(undefined, 'hash-original'), EVENT);
    assert.ok(access);
    assert.equal(access.tokenHash, 'hash-original');
    assert.notEqual(access.tokenHash, 'hash-rotated');
  });
});
