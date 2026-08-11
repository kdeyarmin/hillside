import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import {
  classFormatLabel,
  classLocationLabel,
  isOnlineClass
} from '@/lib/class-access';
import {
  attachSessionToHold,
  holdExpiryUnix,
  releaseHold,
  reserveSeats
} from '@/lib/class-seats';
import { rateLimited } from '@/lib/rate-limit';
import { absoluteUrl, checkoutReturnOrigin } from '@/lib/store';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    /**
     * Rate limited before anything else, because `reserveSeats` below writes a
     * PENDING hold that occupies the seat for 35 minutes *before* Stripe is ever
     * contacted. Unthrottled, two anonymous POSTs asking for six seats each sell
     * out a twelve-seat class at no cost to the caller, repeatable forever — the
     * class page then reads sold out and the booking button disables itself.
     */
    if (rateLimited(request, { name: 'class-checkout', limit: 6, windowMs: 10 * 60_000 })) {
      return NextResponse.json(
        { error: 'Too many booking attempts. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) return NextResponse.json({ error: 'Online registration is not configured yet.' }, { status: 503 });

    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    const raw = body as { classId?: unknown; seats?: unknown };
    const classId = String(raw.classId || '').trim();
    const seats = Math.max(1, Math.min(6, Math.floor(Number(raw.seats) || 1)));
    if (!classId) return NextResponse.json({ error: 'Class not found.' }, { status: 404 });

    const event = await db.classEvent.findFirst({ where: { id: classId, active: true } });
    if (!event || event.startsAt <= new Date()) {
      return NextResponse.json({ error: 'This class is no longer open for registration.' }, { status: 400 });
    }
    if (event.registrationDeadline && event.registrationDeadline <= new Date()) {
      return NextResponse.json({ error: 'Registration for this class has closed.' }, { status: 400 });
    }
    if (event.priceCents <= 0) {
      return NextResponse.json({ error: 'Use the registration form on the class page.' }, { status: 400 });
    }

    /**
     * Reserve before talking to Stripe. Checking availability and inserting the
     * hold as separate statements — with a Stripe round trip between them — let
     * two buyers pass the same check and oversell the class.
     */
    const reservation = await reserveSeats({
      classEventId: event.id,
      capacity: event.capacity,
      seats,
      amountCents: event.priceCents * seats
    });
    if (!reservation.ok) {
      return NextResponse.json(
        {
          error: reservation.seatsLeft
            ? `Only ${reservation.seatsLeft} seats remain.`
            : 'This class is sold out.'
        },
        { status: 400 }
      );
    }

    const stripe = new Stripe(secret);
    const site = checkoutReturnOrigin();
    const online = isOnlineClass(event.format);

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_creation: 'always',
        line_items: [
          {
            quantity: seats,
            price_data: {
              currency: 'usd',
              unit_amount: event.priceCents,
              product_data: {
                name: event.title,
                description: `${classFormatLabel(event.format)} • ${event.startsAt.toLocaleDateString('en-US')} • ${classLocationLabel(event)}`,
                images: event.imageUrl ? [absoluteUrl(event.imageUrl)] : undefined,
                metadata: { hillsideClassId: event.id, classFormat: event.format }
              }
            }
          }
        ],
        /**
         * The session expires exactly when the seat hold does. Left at Stripe's
         * 24 hour default, a customer could pay long after the hold lapsed and
         * the seat had been resold.
         */
        expires_at: holdExpiryUnix(reservation.expiresAt),
        success_url: `${site}/classes/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site}/classes#class-${event.id}`,
        billing_address_collection: 'auto',
        phone_number_collection: { enabled: true },
        invoice_creation: { enabled: true },
        allow_promotion_codes: true,
        consent_collection: { promotions: 'auto' },
        payment_intent_data: {
          description: `The Hillside Gardens class: ${event.title}`,
          metadata: { kind: 'CLASS_REGISTRATION', classEventId: event.id }
        },
        custom_text: {
          submit: {
            message: online
              ? 'After payment, your private Hillside classroom link will be emailed to you.'
              : 'Your class confirmation will be emailed after payment.'
          }
        },
        metadata: {
          kind: 'CLASS_REGISTRATION',
          classEventId: event.id,
          seats: String(seats),
          classFormat: event.format
        }
      });
    } catch (error) {
      await releaseHold(reservation.holdId);
      throw error;
    }

    await attachSessionToHold(reservation.holdId, session.id);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Unable to create class checkout', error);
    return NextResponse.json({ error: 'Unable to start class registration.' }, { status: 500 });
  }
}
