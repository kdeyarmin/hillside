import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import { releaseProductHold } from '@/lib/checkout';
import { rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const SESSION_ID = /^cs_(?:test_|live_)?[A-Za-z0-9]+$/;

/**
 * Stripe Checkout's Cancel button does not expire the session. Inventory stays
 * held until `expires_at` (or a missed-webhook sweep). The cart page posts the
 * session id here so the hold can come off as soon as the customer is back.
 */
export async function POST(request: Request) {
  try {
    if (rateLimited(request, { name: 'checkout-cancel', limit: 8, windowMs: 10 * 60_000 })) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ error: 'Stripe is not configured yet.' }, { status: 503 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const sessionId =
      body && typeof body === 'object' && 'sessionId' in body
        ? String((body as { sessionId?: unknown }).sessionId || '').trim()
        : '';
    if (!SESSION_ID.test(sessionId) || sessionId.length > 255) {
      return NextResponse.json({ error: 'Invalid checkout session.' }, { status: 400 });
    }

    const stripe = new Stripe(secret);
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      return NextResponse.json({ error: 'That checkout could not be found.' }, { status: 404 });
    }

    if (session.metadata?.kind === 'CLASS_REGISTRATION') {
      return NextResponse.json({ released: false, reason: 'class' });
    }

    if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
      return NextResponse.json({ released: false, reason: 'paid' });
    }

    if (session.status === 'open') {
      try {
        await stripe.checkout.sessions.expire(sessionId);
      } catch (error) {
        console.error('Unable to expire Stripe checkout session', error);
        let latest: Stripe.Checkout.Session;
        try {
          latest = await stripe.checkout.sessions.retrieve(sessionId);
        } catch (lookupError) {
          console.error(
            'Unable to re-read Stripe checkout session after expire failed',
            lookupError
          );
          return NextResponse.json(
            {
              error: 'Unable to cancel that checkout just now. Please try again.',
              reason: 'expire-failed'
            },
            { status: 502 }
          );
        }
        if (latest.payment_status === 'paid' || latest.payment_status === 'no_payment_required') {
          return NextResponse.json({ released: false, reason: 'paid' });
        }
        /**
         * The session is still open, so the customer can still pay. Releasing
         * the hold here would put the plant back on the shelf while Stripe
         * still accepts payment against it.
         */
        if (latest.status === 'open') {
          return NextResponse.json(
            {
              error: 'Unable to cancel that checkout just now. Please try again.',
              reason: 'expire-failed'
            },
            { status: 502 }
          );
        }
      }
    }

    const reservedId = session.metadata?.orderId?.trim();
    if (reservedId) {
      await releaseProductHold(reservedId);
    } else {
      const order = await db.order.findUnique({ where: { stripeSessionId: sessionId } });
      if (order) await releaseProductHold(order.id);
    }

    return NextResponse.json({ released: true });
  } catch (error) {
    console.error('Unable to cancel checkout session', error);
    return NextResponse.json({ error: 'Unable to cancel that checkout.' }, { status: 500 });
  }
}
