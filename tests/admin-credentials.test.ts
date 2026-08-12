import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import {
  hashPassword,
  looksLikeEmail,
  normalizeAdminEmail,
  passwordComplaint,
  verifyPassword
} from '../lib/admin-credentials.ts';

describe('hashPassword', () => {
  it('never stores the password itself', () => {
    const stored = hashPassword('a-perfectly-good-password');
    assert.ok(!stored.includes('a-perfectly-good-password'));
    assert.match(stored, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  /**
   * Without a per-account salt, two admins who picked the same password would
   * be visibly identical in the table, and one cracked hash would open both.
   */
  it('salts each hash separately', () => {
    const first = hashPassword('shared-password-here');
    const second = hashPassword('shared-password-here');
    assert.notEqual(first, second);
    assert.ok(verifyPassword('shared-password-here', first));
    assert.ok(verifyPassword('shared-password-here', second));
  });
});

describe('verifyPassword', () => {
  const stored = hashPassword('Tammys-real-password-1!');

  it('accepts the password it was made from', () => {
    assert.ok(verifyPassword('Tammys-real-password-1!', stored));
  });

  it('rejects a wrong password, including near misses', () => {
    assert.ok(!verifyPassword('Tammys-real-password-1', stored));
    assert.ok(!verifyPassword('tammys-real-password-1!', stored));
    assert.ok(!verifyPassword('', stored));
  });

  /**
   * A row whose hash was truncated, blanked or written in some other format
   * must fail closed. Returning true — or throwing, on a login route — would
   * turn a corrupt record into an open door.
   */
  it('fails closed on a stored value it cannot read', () => {
    for (const bad of ['', 'not-a-hash', 'scrypt$16384$8$1$onlyfourparts', 'bcrypt$16384$8$1$c2FsdA==$aGFzaA==']) {
      assert.ok(!verifyPassword('Tammys-real-password-1!', bad), `expected ${bad} to be rejected`);
    }
  });

  it('rejects a hash of the wrong length rather than comparing it', () => {
    const truncated = stored.split('$').slice(0, 5).concat('c2hvcnQ=').join('$');
    assert.ok(!verifyPassword('Tammys-real-password-1!', truncated));
  });

  /**
   * The parameters come out of the stored string, so an absurd N would make
   * every sign-in attempt against that account cost hundreds of megabytes and
   * seconds of CPU. The bound turns that into a failed verification.
   */
  it('refuses a cost whose working set is out of bounds instead of paying it', () => {
    const salt = crypto.randomBytes(16).toString('base64');
    const hash = crypto.randomBytes(64).toString('base64');
    const started = process.hrtime.bigint();

    // 128 * 2^24 * 8 is 16 GiB of working set.
    assert.ok(!verifyPassword('anything', `scrypt$16777216$8$1$${salt}$${hash}`));
    assert.ok(!verifyPassword('anything', `scrypt$16384$4096$1$${salt}$${hash}`));
    assert.ok(!verifyPassword('anything', `scrypt$16384$8$99$${salt}$${hash}`));

    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(elapsedMs < 100, `expected an immediate refusal, took ${elapsedMs}ms`);
  });

  /**
   * The cost is recorded in the stored string precisely so it can be raised
   * later. An account hashed under the old parameters has to keep working
   * until its owner next changes their password.
   */
  it('reads back a hash written at a cost other than today’s default', () => {
    const salt = crypto.randomBytes(16);
    const cost = { N: 1024, r: 8, p: 1 };
    const derived = crypto.scryptSync('written-under-old-parameters', salt, 64, cost);
    const legacy = `scrypt$${cost.N}$${cost.r}$${cost.p}$${salt.toString('base64')}$${derived.toString('base64')}`;

    assert.ok(verifyPassword('written-under-old-parameters', legacy));
    assert.ok(!verifyPassword('some-other-password', legacy));
  });
});

describe('normalizeAdminEmail', () => {
  /**
   * The address people type is not the address they registered. Sign-in looks
   * accounts up by the normalised form so capitalisation or a trailing space
   * pasted from an email client is not a failed login.
   */
  it('lowercases and trims so one person is one account', () => {
    assert.equal(normalizeAdminEmail('  Tjhill61111@Yahoo.com '), 'tjhill61111@yahoo.com');
    assert.equal(normalizeAdminEmail('tjhill61111@yahoo.com'), 'tjhill61111@yahoo.com');
  });
});

describe('looksLikeEmail', () => {
  it('separates addresses from typos', () => {
    assert.ok(looksLikeEmail('tjhill61111@yahoo.com'));
    assert.ok(!looksLikeEmail('tjhill61111'));
    assert.ok(!looksLikeEmail('tjhill61111@yahoo'));
    assert.ok(!looksLikeEmail('two addresses@example.com'));
  });
});

describe('passwordComplaint', () => {
  it('passes a password of a usable length', () => {
    assert.equal(passwordComplaint('Tammypass24!'), null);
  });

  it('rejects a short one', () => {
    assert.match(String(passwordComplaint('short')), /at least 10 characters/);
  });

  /**
   * A password stored with an accidental trailing space cannot be typed back
   * in reliably; better to refuse it at creation than to hand out a login
   * nobody can use.
   */
  it('rejects surrounding whitespace', () => {
    assert.match(String(passwordComplaint('trailing space ')), /space/);
  });
});
