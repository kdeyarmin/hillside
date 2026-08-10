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
    adminAuth: Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET),
    analytics: Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID)
  };

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (error) {
    console.error('Health check could not reach the database', error);
  }

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
