import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.CLASS_ACCESS_SECRET ||= 'test-class-access-secret-long-enough-to-be-real';

const { createFreeClassConfirmToken, freeClassConfirmExpiry, readFreeClassConfirmToken } =
  await import('../lib/class-confirm.ts');

describe('free class confirm tokens', () => {
  it('round-trips the registration the email pointed at', () => {
    const expiresAt = new Date(Date.now() + 60 * 60_000);
    const token = createFreeClassConfirmToken(
      'reg_1',
      'Guest@Hillside.example',
      'class_9',
      expiresAt
    );
    assert.ok(token);
    const payload = readFreeClassConfirmToken(token);
    assert.ok(payload);
    assert.equal(payload.registrationId, 'reg_1');
    assert.equal(payload.email, 'guest@hillside.example');
    assert.equal(payload.classEventId, 'class_9');
    assert.equal(payload.exp, expiresAt.getTime());
  });

  it('rejects a forged or expired token', () => {
    const token = createFreeClassConfirmToken(
      'reg_1',
      'a@b.com',
      'class_9',
      new Date(Date.now() + 60_000)
    );
    assert.ok(token);
    assert.equal(readFreeClassConfirmToken(`${token}x`), null);
    assert.equal(
      readFreeClassConfirmToken(
        createFreeClassConfirmToken('reg_1', 'a@b.com', 'class_9', new Date(Date.now() - 1000))!
      ),
      null
    );
  });
});

describe('freeClassConfirmExpiry', () => {
  it('never holds a seat for less than 30 minutes or more than a day', () => {
    const now = new Date('2026-08-16T12:00:00Z');
    const soon = freeClassConfirmExpiry(new Date('2026-08-16T12:10:00Z'), now);
    assert.equal(soon.getTime() - now.getTime(), 30 * 60_000);

    const nextWeek = freeClassConfirmExpiry(new Date('2026-08-30T12:00:00Z'), now);
    assert.equal(nextWeek.getTime() - now.getTime(), 24 * 60 * 60_000);
  });
});
