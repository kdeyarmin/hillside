import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NEXT_PUBLIC_SITE_URL ||= 'https://thehillsidegardens.com';

const {
  describeStripeFailure,
  stripeDiagnostics,
  stripeHealthHint,
  stripeKeyMode,
  stripeKeyReport
} = await import('../lib/stripe-health.ts');

describe('stripeKeyMode', () => {
  it('classifies each key prefix', () => {
    assert.equal(stripeKeyMode('sk_live_abc'), 'live');
    assert.equal(stripeKeyMode('sk_test_abc'), 'test');
    assert.equal(stripeKeyMode('rk_live_abc'), 'restricted-live');
    assert.equal(stripeKeyMode('rk_test_abc'), 'restricted-test');
  });

  it('calls a publishable or mangled key what it is: not a secret key', () => {
    assert.equal(stripeKeyMode('pk_live_abc'), 'unrecognized');
    assert.equal(stripeKeyMode('whsec_abc'), 'unrecognized');
    assert.equal(stripeKeyMode('"sk_live_abc"'), 'unrecognized');
  });

  it('treats blank and unset alike, and reads the mode through padding', () => {
    assert.equal(stripeKeyMode(undefined), 'missing');
    assert.equal(stripeKeyMode('   '), 'missing');
    // The mode is still knowable through a pasted newline; whether the padding
    // itself breaks requests is the separate keyHasWhitespace report.
    assert.equal(stripeKeyMode('sk_live_abc\n'), 'live');
  });
});

describe('describeStripeFailure', () => {
  it('reads type, code and status from a Stripe-shaped error', () => {
    assert.equal(
      describeStripeFailure({
        type: 'StripeAuthenticationError',
        code: 'api_key_expired',
        statusCode: 401,
        message: 'Expired API Key provided'
      }),
      'StripeAuthenticationError, api_key_expired, HTTP 401: Expired API Key provided'
    );
  });

  it('copes with a Stripe error carrying no code', () => {
    assert.equal(
      describeStripeFailure({ type: 'StripeConnectionError', message: 'Request timed out' }),
      'StripeConnectionError: Request timed out'
    );
  });

  it('falls back to name and message for an ordinary error', () => {
    assert.equal(
      describeStripeFailure(new TypeError('Invalid character in header content')),
      'TypeError: Invalid character in header content'
    );
  });

  it('stringifies a thrown non-error rather than crashing the log line', () => {
    assert.equal(describeStripeFailure('boom'), 'boom');
  });
});

describe('stripeHealthHint', () => {
  it('says what to do about an unset key', () => {
    assert.match(
      stripeHealthHint({ keyMode: 'missing', connection: 'skipped' }) || '',
      /STRIPE_SECRET_KEY is not set/
    );
  });

  it('names pasted whitespace before anything else — the key itself may be right', () => {
    assert.match(
      stripeHealthHint({ keyMode: 'live', keyHasWhitespace: true, connection: 'failed' }) || '',
      /whitespace/
    );
  });

  it('warns that a test key charges nobody', () => {
    assert.match(stripeHealthHint({ keyMode: 'test', connection: 'ok' }) || '', /charge nobody/);
  });

  it('flags a value that is not a secret key at all', () => {
    assert.match(
      stripeHealthHint({ keyMode: 'unrecognized', connection: 'skipped' }) || '',
      /does not look like a Stripe secret key/
    );
  });

  it('advises re-pasting when a well-formed live key is refused', () => {
    assert.match(
      stripeHealthHint({ keyMode: 'live', connection: 'failed' }) || '',
      /Stripe refused the configured key/
    );
  });

  it('stays quiet when everything checks out', () => {
    assert.equal(stripeHealthHint({ keyMode: 'live', connection: 'ok' }), undefined);
  });
});

describe('stripeDiagnostics', () => {
  it('reports an unset key without touching the network', async () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      const result = await stripeDiagnostics({ probeCheckout: true });
      assert.equal(result.keyMode, 'missing');
      assert.equal(result.connection, 'skipped');
      assert.equal(result.checkoutProbe, 'skipped');
      assert.match(result.hint || '', /STRIPE_SECRET_KEY is not set/);
    } finally {
      if (saved === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = saved;
    }
  });
});

describe('stripeKeyReport', () => {
  it('reports pasted whitespace alongside the mode it can still read', () => {
    assert.deepEqual(stripeKeyReport('sk_live_padded\n'), {
      keyMode: 'live',
      keyHasWhitespace: true
    });
  });

  it('carries no whitespace flag for a clean key', () => {
    assert.deepEqual(stripeKeyReport('sk_live_clean'), { keyMode: 'live' });
  });
});
