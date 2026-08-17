import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

const originalEnv = {
  NEWSLETTER_UNSUBSCRIBE_SECRET: process.env.NEWSLETTER_UNSUBSCRIBE_SECRET,
  NEWSLETTER_UNSUBSCRIBE_SECRET_PREVIOUS: process.env.NEWSLETTER_UNSUBSCRIBE_SECRET_PREVIOUS,
  ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
  CLASS_ACCESS_SECRET: process.env.CLASS_ACCESS_SECRET
};

function resetNewsletterSecrets(values: Record<string, string | undefined>) {
  for (const key of Object.keys(originalEnv) as Array<keyof typeof originalEnv>) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
}

process.env.ADMIN_SESSION_SECRET ||= 'test-admin-session-secret-long-enough';

const { createUnsubscribeToken, readUnsubscribeToken, unsubscribeUrl } =
  await import('../lib/newsletter.ts');

describe('newsletter unsubscribe tokens', () => {
  beforeEach(() => {
    resetNewsletterSecrets({
      ADMIN_SESSION_SECRET: 'test-admin-session-secret-long-enough'
    });
  });

  afterEach(() => {
    resetNewsletterSecrets(originalEnv);
  });

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

  it('still verifies a token after a dedicated newsletter secret is added', () => {
    const legacy = createUnsubscribeToken('legacy@example.com');
    assert.ok(legacy);

    process.env.NEWSLETTER_UNSUBSCRIBE_SECRET = 'dedicated-newsletter-secret';
    assert.equal(readUnsubscribeToken(legacy), 'legacy@example.com');

    const next = createUnsubscribeToken('legacy@example.com');
    assert.ok(next);
    assert.notEqual(next, legacy);
    assert.equal(readUnsubscribeToken(next), 'legacy@example.com');
  });

  it('still verifies a token signed with the previous newsletter secret', () => {
    process.env.NEWSLETTER_UNSUBSCRIBE_SECRET = 'old-newsletter-secret';
    const previous = createUnsubscribeToken('rotate@example.com');
    assert.ok(previous);

    process.env.NEWSLETTER_UNSUBSCRIBE_SECRET = 'new-newsletter-secret';
    process.env.NEWSLETTER_UNSUBSCRIBE_SECRET_PREVIOUS = 'old-newsletter-secret';
    assert.equal(readUnsubscribeToken(previous), 'rotate@example.com');

    const rotated = createUnsubscribeToken('rotate@example.com');
    assert.ok(rotated);
    assert.notEqual(rotated, previous);
    assert.equal(readUnsubscribeToken(rotated), 'rotate@example.com');
  });
});
