import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reports which integrations are actually wired. Email in particular used to
 * fail silently: without RESEND_API_KEY every order confirmation was dropped
 * with nothing anywhere recording it.
 */
export async function GET() {
  const checks = {
    database: false,
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    email: Boolean(process.env.RESEND_API_KEY),
    telnyxVideo: Boolean(process.env.TELNYX_API_KEY),
    adminAuth: false,
    analytics: Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID)
  };

  /**
   * Signing in needs the session secret plus something to sign in *with*:
   * either a named admin account or the shared password. Reporting only on the
   * environment variables would have called the site healthy at the point
   * where nobody could get into the dashboard.
   */
  let adminAccounts = 0;
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = true;
    adminAccounts = await db.adminUser.count({ where: { active: true } });
  } catch (error) {
    console.error('Health check could not reach the database', error);
  }

  checks.adminAuth = Boolean(
    process.env.ADMIN_SESSION_SECRET && (adminAccounts > 0 || process.env.ADMIN_PASSWORD)
  );

  const expected: Array<keyof typeof checks> = ['stripe', 'stripeWebhook', 'email', 'adminAuth'];
  const missing = expected.filter((key) => !checks[key]);

  /**
   * Railway gates deploys on this endpoint, so the status code reports liveness
   * only — an unset integration is worth surfacing, never worth failing a
   * release for. `configured` carries that detail in the body instead.
   */
  return NextResponse.json(
    {
      ok: checks.database,
      configured: missing.length === 0,
      service: 'hillside-gardens',
      checks,
      missing
    },
    { status: checks.database ? 200 : 503 }
  );
}
