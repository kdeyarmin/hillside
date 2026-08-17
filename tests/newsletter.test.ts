import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.ADMIN_SESSION_SECRET ||= 'test-admin-session-secret-long-enough';

const { createUnsubscribeToken, readUnsubscribeToken, unsubscribeUrl } =
  await import('../lib/newsletter.ts');

describe('newsletter unsubscribe tokens', () => {
  it('round-trips a normalized email', () => {
    const token = createUnsubscribeToken('Guest@Hillside.example');
    assert.ok(token);
    assert.equal(readUnsubscribeToken(token), 'guest@hillside.example');
  });

  it('rejects a tampered signature and empty input', () => {
    const token = createUnsubscribeToken('a@b.com');
    assert.ok(token);
    const [encoded] = token.split('.');
    assert.equal(readUnsubscribeToken(`${encoded}.aaaaaaaa`), null);
    assert.equal(readUnsubscribeToken('not-a-token'), null);
    assert.equal(readUnsubscribeToken(''), null);
  });

  it('does not expire — a year-old email should still honour unsubscribe', () => {
    const token = createUnsubscribeToken('keep@example.com');
    assert.ok(token);
    assert.equal(readUnsubscribeToken(token), 'keep@example.com');
  });

  it('builds a site unsubscribe URL when a secret is configured', () => {
    const url = unsubscribeUrl('notes@example.com');
    assert.ok(url);
    assert.match(url, /\/newsletter\/unsubscribe\?token=/);
  });
});
