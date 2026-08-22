import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { sendEmail } from '../lib/email.ts';

/**
 * These cover `sendEmail` itself — what it puts on the wire and what it reports
 * back — which nothing did before. The audit log the owner's page is built on
 * is written from exactly these branches, so a change that silently mislabels
 * or loses a row would otherwise reach production unnoticed.
 *
 * `recordEmail` reaches for the database and fails here, which is the point of
 * it never throwing: the send still returns its real answer. Its console noise
 * is muted rather than left to bury the test output.
 */

type Captured = { url: string; body: Record<string, unknown> } | null;

let captured: Captured = null;
let restoreFetch: (() => void) | null = null;
let restoreError: (() => void) | null = null;

function stubFetch(respond: () => Promise<Response> | Response) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: { body?: string }) => {
    captured = { url: String(url), body: JSON.parse(String(init?.body || '{}')) };
    return respond();
  }) as unknown as typeof globalThis.fetch;
  restoreFetch = () => {
    globalThis.fetch = original;
  };
}

function personalizationTo(body: Record<string, unknown>) {
  const personalizations = body.personalizations as Array<{ to: Array<{ email: string }> }>;
  return personalizations.map((entry) => entry.to.map((target) => target.email));
}

beforeEach(() => {
  captured = null;
  process.env.SENDGRID_API_KEY = 'test-key';
  process.env.EMAIL_FROM = 'The Hillside Gardens <orders@thehillsidegardens.com>';
  const originalError = console.error;
  console.error = () => {};
  restoreError = () => {
    console.error = originalError;
  };
});

afterEach(() => {
  restoreFetch?.();
  restoreError?.();
  restoreFetch = null;
  restoreError = null;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.EMAIL_FROM;
});

describe('sendEmail recipients', () => {
  it('gives every address its own personalization, so recipients cannot see each other', async () => {
    // The compose box accepts up to five unrelated customers. One shared `to`
    // would disclose each of their addresses to the other four.
    stubFetch(() => new Response('', { status: 202, headers: { 'x-message-id': 'abc' } }));
    await sendEmail({
      to: ['one@example.com', 'two@example.com', 'three@example.com'],
      subject: 'Hello',
      html: '<p>Hi</p>'
    });
    assert.deepEqual(personalizationTo(captured!.body), [
      ['one@example.com'],
      ['two@example.com'],
      ['three@example.com']
    ]);
  });

  it('trims and drops blank addresses before they reach the provider', async () => {
    stubFetch(() => new Response('', { status: 202 }));
    await sendEmail({ to: ['  one@example.com  ', '', '   '], subject: 'S', html: '<p>H</p>' });
    assert.deepEqual(personalizationTo(captured!.body), [['one@example.com']]);
  });

  it('sends the subject, body and parsed sender', async () => {
    stubFetch(() => new Response('', { status: 202 }));
    await sendEmail({ to: 'one@example.com', subject: 'A subject', html: '<p>Body</p>' });
    assert.equal(captured!.url, 'https://api.sendgrid.com/v3/mail/send');
    assert.equal(captured!.body.subject, 'A subject');
    assert.deepEqual(captured!.body.from, {
      email: 'orders@thehillsidegardens.com',
      name: 'The Hillside Gardens'
    });
    assert.deepEqual(captured!.body.content, [{ type: 'text/html', value: '<p>Body</p>' }]);
  });

  it('puts the plain-text alternative ahead of the HTML, and omits it when blank', async () => {
    stubFetch(() => new Response('', { status: 202 }));
    await sendEmail({ to: 'a@example.com', subject: 'S', html: '<p>H</p>', text: 'H' });
    assert.deepEqual(captured!.body.content, [
      { type: 'text/plain', value: 'H' },
      { type: 'text/html', value: '<p>H</p>' }
    ]);

    restoreFetch?.();
    stubFetch(() => new Response('', { status: 202 }));
    await sendEmail({ to: 'a@example.com', subject: 'S', html: '<p>H</p>', text: '   ' });
    assert.deepEqual(captured!.body.content, [{ type: 'text/html', value: '<p>H</p>' }]);
  });
});

describe('sendEmail outcomes', () => {
  it('reports the provider message id on success', async () => {
    stubFetch(() => new Response('', { status: 202, headers: { 'x-message-id': 'msg-42' } }));
    const result = await sendEmail({ to: 'a@example.com', subject: 'S', html: '<p>H</p>' });
    assert.deepEqual(result, { sent: true, id: 'msg-42' });
  });

  it('reports a refusal as provider-error rather than as a send', async () => {
    stubFetch(() => new Response('bad request', { status: 400 }));
    const result = await sendEmail({ to: 'a@example.com', subject: 'S', html: '<p>H</p>' });
    assert.deepEqual(result, { sent: false, reason: 'provider-error' });
  });

  it('reports a thrown connection as network-error', async () => {
    stubFetch(() => {
      throw new Error('socket hang up');
    });
    const result = await sendEmail({ to: 'a@example.com', subject: 'S', html: '<p>H</p>' });
    assert.deepEqual(result, { sent: false, reason: 'network-error' });
  });

  it('says not-configured before it says no-email, which order fulfillment branches on', async () => {
    // `sendOrderEmails` returns early on not-configured but presses on to the
    // owner notice for no-email. Swapping these two changes which path a
    // paid order takes.
    delete process.env.SENDGRID_API_KEY;
    stubFetch(() => new Response('', { status: 202 }));
    assert.deepEqual(await sendEmail({ to: '', subject: 'S', html: '<p>H</p>' }), {
      sent: false,
      reason: 'not-configured'
    });
    assert.equal(captured, null, 'nothing should reach the provider');

    process.env.SENDGRID_API_KEY = 'test-key';
    assert.deepEqual(await sendEmail({ to: '   ', subject: 'S', html: '<p>H</p>' }), {
      sent: false,
      reason: 'no-email'
    });
    assert.equal(captured, null, 'an address-less send never reaches the provider');
  });

  it('suppresses a repeat of the same idempotency key without calling the provider twice', async () => {
    let calls = 0;
    stubFetch(() => {
      calls += 1;
      return new Response('', { status: 202, headers: { 'x-message-id': 'first' } });
    });
    const key = `test-idempotency-${process.pid}-${calls}`;
    const first = await sendEmail({
      to: 'a@example.com',
      subject: 'S',
      html: '<p>H</p>',
      idempotencyKey: key
    });
    const second = await sendEmail({
      to: 'a@example.com',
      subject: 'S',
      html: '<p>H</p>',
      idempotencyKey: key
    });
    assert.deepEqual(first, { sent: true, id: 'first' });
    assert.deepEqual(second, { sent: true, id: null });
    assert.equal(calls, 1);
  });
});
