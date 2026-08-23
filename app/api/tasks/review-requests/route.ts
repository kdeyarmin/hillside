import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { rateLimited } from '@/lib/rate-limit';
import { REVIEW_REQUEST_BATCH } from '@/lib/review-request';
import { sendDueReviewRequests } from '@/lib/review-request-send';

export const runtime = 'nodejs';

/**
 * The scheduled half of the review follow-up.
 *
 * Tammy can send the batch herself from the dashboard, which is the path that
 * actually gets used day to day. This exists so the same batch can be run on a
 * timer by whatever schedules jobs against this service, without a browser and
 * without the admin session.
 *
 * Unset `TASKS_SECRET` means the endpoint is off, not open. A route that sends
 * customer email must never be callable by anyone who finds its address.
 */
function authorised(request: Request) {
  const secret = process.env.TASKS_SECRET?.trim();
  if (!secret) return false;

  /**
   * The header, and only the header. A `?token=` fallback was convenient for a
   * scheduler that cannot set one, but it puts a long-lived credential into a
   * URL — and URLs are what proxies, load balancers and platform dashboards
   * write to their access logs. Anyone who later reads one of those logs could
   * run the shop's customer-email job.
   */
  const header = request.headers.get('authorization') || '';
  const presented = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!presented) return false;

  const left = Buffer.from(presented);
  const right = Buffer.from(secret);
  // Length is compared first because timingSafeEqual throws on a mismatch; the
  // length of the configured secret is not a secret worth protecting.
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!process.env.TASKS_SECRET?.trim()) {
    return NextResponse.json(
      { error: 'Scheduled tasks are switched off. Set TASKS_SECRET to enable them.' },
      { status: 503 }
    );
  }
  // Throttled on the unauthenticated path too, so the endpoint cannot be used
  // to guess at the secret quickly.
  if (rateLimited(request, { name: 'tasks-review-requests', limit: 6, windowMs: 10 * 60_000 })) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  try {
    const result = await sendDueReviewRequests({ limit: REVIEW_REQUEST_BATCH });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Review request run failed', error);
    return NextResponse.json({ error: 'The review request run failed.' }, { status: 500 });
  }
}
