import Stripe from 'stripe';
import { checkoutReturnOrigin } from './store.ts';

/**
 * Names what is wrong with the shop's Stripe connection, for the signed-in
 * health view.
 *
 * Checkout failures land in the customer's cart as one generic "please try
 * again", and the error that caused them lands in the platform's server logs —
 * which nobody running the shop reads. Every live checkout on record has failed
 * that way, and from the outside there was no telling whether the deployed key
 * was wrong, restricted, pasted with a stray newline, or refused for something
 * else entirely. These probes run with the same key, from the same server, and
 * report the exact refusal.
 */

export type StripeKeyMode =
  'live' | 'test' | 'restricted-live' | 'restricted-test' | 'unrecognized' | 'missing';

export type StripeDiagnostics = {
  keyMode: StripeKeyMode;
  /** True when the configured key carries leading or trailing whitespace. */
  keyHasWhitespace?: boolean;
  connection: 'ok' | 'failed' | 'skipped';
  accountId?: string;
  accountName?: string;
  error?: string;
  checkoutProbe: 'ok' | 'failed' | 'skipped';
  checkoutProbeError?: string;
  hint?: string;
};

export function stripeKeyMode(secret: string | null | undefined): StripeKeyMode {
  const key = (secret || '').trim();
  if (!key) return 'missing';
  if (key.startsWith('sk_live_')) return 'live';
  if (key.startsWith('sk_test_')) return 'test';
  if (key.startsWith('rk_live_')) return 'restricted-live';
  if (key.startsWith('rk_test_')) return 'restricted-test';
  return 'unrecognized';
}

/**
 * Everything the key's shape alone can prove, before any request is made.
 * Split out from the live probes so it can be reasoned about — and tested —
 * without a Stripe round trip.
 */
export function stripeKeyReport(
  secret: string | null | undefined
): Pick<StripeDiagnostics, 'keyMode' | 'keyHasWhitespace'> {
  const keyMode = stripeKeyMode(secret);
  return secret && secret !== secret.trim() ? { keyMode, keyHasWhitespace: true } : { keyMode };
}

/**
 * One line naming a Stripe refusal: type, code and HTTP status when the error
 * carries them, so "authentication_error, HTTP 401: Invalid API Key provided"
 * reads as itself instead of as a stringified object. Duck-typed rather than
 * `instanceof` so it still reads errors that crossed a module boundary.
 */
export function describeStripeFailure(error: unknown): string {
  if (error && typeof error === 'object') {
    const raw = error as {
      type?: unknown;
      code?: unknown;
      statusCode?: unknown;
      message?: unknown;
    };
    if (typeof raw.type === 'string' && typeof raw.message === 'string') {
      const detail = [
        raw.type,
        typeof raw.code === 'string' ? raw.code : null,
        typeof raw.statusCode === 'number' ? `HTTP ${raw.statusCode}` : null
      ]
        .filter(Boolean)
        .join(', ');
      return `${detail}: ${raw.message}`;
    }
  }
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * The advice half of the report: what the key's shape alone already proves,
 * before any request is made. A test key silently charges nobody, and a key
 * pasted with a stray newline fails every request with an error that never
 * mentions whitespace, so both are named outright.
 */
export function stripeHealthHint(
  diagnostics: Pick<StripeDiagnostics, 'keyMode' | 'keyHasWhitespace' | 'connection'>
): string | undefined {
  if (diagnostics.keyMode === 'missing') {
    return 'STRIPE_SECRET_KEY is not set. Paste the live secret key from the Stripe Dashboard (Developers → API keys) into the deploy environment.';
  }
  if (diagnostics.keyHasWhitespace) {
    return 'STRIPE_SECRET_KEY has leading or trailing whitespace — a stray newline from a paste fails every Stripe request. Re-paste the key with nothing around it.';
  }
  if (diagnostics.keyMode === 'test' || diagnostics.keyMode === 'restricted-test') {
    return 'STRIPE_SECRET_KEY is a TEST key: checkouts land in test mode and charge nobody. Paste the live secret key (sk_live_…) from the Stripe Dashboard.';
  }
  if (diagnostics.keyMode === 'unrecognized') {
    return 'STRIPE_SECRET_KEY does not look like a Stripe secret key (sk_live_…). Re-paste it from the Stripe Dashboard (Developers → API keys).';
  }
  if (diagnostics.connection === 'failed') {
    return 'Stripe refused the configured key. Paste the current live secret key from the Stripe Dashboard (Developers → API keys) — a rolled or deleted key stays refused until replaced.';
  }
  return undefined;
}

/**
 * Asks Stripe, with the shop's own key from the shop's own server, first "who
 * am I" and then — only when `probeCheckout` is set — "may I open a checkout".
 *
 * The checkout probe creates a real session with every account-sensitive
 * switch the customer path turns on (automatic tax, invoice creation, the
 * consent box), because a key can pass `/v1/account` and still be refused
 * exactly there. The probe session sells nothing, reserves nothing, carries a
 * metadata kind the webhook ignores, and is expired again in the same breath.
 * It is behind an explicit query parameter so merely opening the health view
 * never writes into the Stripe account.
 */
export async function stripeDiagnostics({
  probeCheckout = false
}: { probeCheckout?: boolean } = {}): Promise<StripeDiagnostics> {
  const configured = process.env.STRIPE_SECRET_KEY;
  const result: StripeDiagnostics = {
    ...stripeKeyReport(configured),
    connection: 'skipped',
    checkoutProbe: 'skipped'
  };
  if (!configured) {
    result.hint = stripeHealthHint(result);
    return result;
  }

  /**
   * No retries and a short timeout: this renders on the owner's health view,
   * and stripe-node's default of three transparent retries against a dead key
   * would hold the page for most of a minute to say nothing the first attempt
   * had not already said. The key goes in untrimmed on purpose — the probe
   * must fail the way checkout fails, not the way a corrected key would work.
   */
  const stripe = new Stripe(configured, { timeout: 8_000, maxNetworkRetries: 0 });

  try {
    const account = await stripe.accounts.retrieve();
    result.connection = 'ok';
    result.accountId = account.id;
    result.accountName =
      account.settings?.dashboard?.display_name || account.business_profile?.name || undefined;
  } catch (error) {
    result.connection = 'failed';
    result.error = describeStripeFailure(error);
    result.hint = stripeHealthHint(result);
    return result;
  }

  if (probeCheckout) {
    try {
      const site = checkoutReturnOrigin();
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: 100,
              product_data: { name: 'Connection check — not for sale' }
            }
          }
        ],
        automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === 'true' },
        invoice_creation: { enabled: true },
        customer_creation: 'always',
        phone_number_collection: { enabled: true },
        consent_collection: { promotions: 'auto' },
        shipping_address_collection: { allowed_countries: ['US'] },
        success_url: `${site}/order/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site}/cart`,
        metadata: { kind: 'HEALTH_PROBE' }
      });
      result.checkoutProbe = 'ok';
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch {
        // The probe session holds no stock and expires on Stripe's own clock;
        // failing to expire it early is untidy, not a failed probe.
      }
    } catch (error) {
      result.checkoutProbe = 'failed';
      result.checkoutProbeError = describeStripeFailure(error);
    }
  }

  result.hint = stripeHealthHint(result);
  return result;
}
