import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { stripeDiagnostics } from '@/lib/stripe-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reports which integrations are actually wired. Email in particular used to
 * fail silently: without SENDGRID_API_KEY every order confirmation was dropped
 * with nothing anywhere recording it.
 *
 * The public body is liveness only. A detailed map of which keys are missing
 * is useful on the dashboard and useful to an attacker doing recon, so it is
 * reserved for a signed-in admin.
 */
export async function GET(request: Request) {
  const checks = {
    database: false,
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    email: Boolean(process.env.SENDGRID_API_KEY),
    telnyxVideo: Boolean(process.env.TELNYX_API_KEY),
    adminAuth: false,
    analytics: Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID)
  };

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (error) {
    console.error('Health check could not reach the database', error);
  }

  /**
   * Signing in needs the session secret plus something to sign in *with*:
   * either a named admin account or the shared password. Reporting only on the
   * environment variables would have called the site healthy at the point
   * where nobody could get into the dashboard.
   *
   * The account query is its own probe, and its own failure. A reachable
   * database whose AdminUser table is missing or unreadable — a schema push
   * that never ran, a permissions problem — is a different fault from an
   * unreachable one, and it leaves named accounts unable to sign in, so it is
   * reported rather than folded into a "could not reach the database" line.
   */
  let activeAccounts: number | null = null;
  if (checks.database) {
    try {
      activeAccounts = await db.adminUser.count({ where: { active: true } });
    } catch (error) {
      console.error(
        'Health check reached the database but could not read the admin accounts',
        error
      );
    }
  }

  checks.adminAuth = Boolean(
    process.env.ADMIN_SESSION_SECRET &&
    activeAccounts !== null &&
    (activeAccounts > 0 || process.env.ADMIN_PASSWORD)
  );

  const expected: Array<keyof typeof checks> = ['stripe', 'stripeWebhook', 'email', 'adminAuth'];
  const missing = expected.filter((key) => !checks[key]);

  /**
   * Railway gates deploys on this endpoint, so the status code reports liveness
   * only — an unset integration is worth surfacing, never worth failing a
   * release for. `configured` carries that detail in the body instead, and only
   * for someone already signed in to the dashboard.
   */
  /**
   * `checks.stripe` above only says a key is *set*; whether Stripe accepts it
   * is a different question, and the one every failed checkout actually asks.
   * Asked live here, admin-only: the answer costs a Stripe round trip and
   * names the account, neither of which belongs in the unauthenticated body
   * Railway polls. `?probe=checkout` additionally opens and immediately
   * expires a throwaway Checkout Session, because a key can pass `/v1/account`
   * and still be refused at the call the cart depends on.
   */
  const signedIn = await isAdmin();
  const stripe = signedIn
    ? await stripeDiagnostics({
        probeCheckout: new URL(request.url).searchParams.get('probe') === 'checkout'
      })
    : null;

  return NextResponse.json(
    signedIn
      ? {
          ok: checks.database,
          configured: missing.length === 0,
          service: 'hillside-gardens',
          checks,
          missing,
          stripe
        }
      : {
          ok: checks.database,
          service: 'hillside-gardens'
        },
    { status: checks.database ? 200 : 503 }
  );
}
