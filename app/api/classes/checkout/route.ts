import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import {
  classFormatLabel,
  classLocationLabel,
  isOnlineClass,
  seatsShortLabel
} from '@/lib/class-access';
import { attachSessionToHold, holdExpiryUnix, releaseHold, reserveSeats } from '@/lib/class-seats';
import { stripeProductDescription, stripeProductImages } from '@/lib/checkout';
import { CLASSES_EXIT_LINK, CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { rateLimited } from '@/lib/rate-limit';
import { checkoutReturnOrigin } from '@/lib/store';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    /**
     * Rate limited before anything else, because `reserveSeats` below writes a
     * PENDING hold that occupies the seat for 35 minutes *before* Stripe is ever
     * contacted. Unthrottled, two anonymous POSTs asking for six seats each sell
     * out a twelve-seat class at no cost to the caller, repeatable forever — the
     * class page then reads sold out and the booking button disables itself.
     *
     * Two attempts per ten minutes still lets a guest recover from a closed tab;
     * six was enough to empty a typical class from one IP.
     */
    if (rateLimited(request, { name: 'class-checkout', limit: 2, windowMs: 10 * 60_000 })) {
      return NextResponse.json(
        { error: 'Too many booking attempts. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret)
      return NextResponse.json(
        { error: 'Online registration is not configured yet.' },
        { status: 503 }
      );

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }
    if (!body || typeof body !== 'object')
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    const raw = body as { classId?: unknown; seats?: unknown };
    const classId = String(raw.classId || '').trim();
    const seats = Math.max(1, Math.min(6, Math.floor(Number(raw.seats) || 1)));
    if (!classId) return NextResponse.json({ error: 'Class not found.' }, { status: 404 });

    const event = await db.classEvent.findFirst({ where: { id: classId, active: true } });
    if (!event || event.startsAt <= new Date()) {
      return NextResponse.json(
        { error: 'This class is no longer open for registration.' },
        { status: 400 }
      );
    }
    if (event.registrationDeadline && event.registrationDeadline <= new Date()) {
      return NextResponse.json(
        { error: 'Registration for this class has closed.' },
        { status: 400 }
      );
    }
    if (event.priceCents <= 0) {
      return NextResponse.json(
        { error: 'Use the registration form on the class page.' },
        { status: 400 }
      );
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
        { error: seatsShortLabel(reservation.seatsLeft) },
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
                description: stripeProductDescription(
                  `${classFormatLabel(event.format)} • ${event.startsAt.toLocaleDateString('en-US')} • ${classLocationLabel(event)}`
                ),
                images: stripeProductImages(event.imageUrl),
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
        // Cancelling has to land somewhere that answers. While the listing is
        // hidden that is the shared exit, not a 404 with a class anchor on it.
        cancel_url: CLASSES_PUBLICLY_VISIBLE
          ? `${site}/classes#class-${event.id}`
          : `${site}${CLASSES_EXIT_LINK.href}`,
        billing_address_collection: 'auto',
        phone_number_collection: { enabled: true },
        invoice_creation: { enabled: true },
        allow_promotion_codes: true,
        consent_collection: { promotions: 'auto' },
        payment_intent_data: {
          description: `The Hillside Gardens class: ${event.title}`,
          metadata: {
            kind: 'CLASS_REGISTRATION',
            classEventId: event.id,
            holdId: reservation.holdId
          }
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
          classFormat: event.format,
          holdId: reservation.holdId
        }
      });

      try {
        await attachSessionToHold(reservation.holdId, session.id);
      } catch (error) {
        /**
         * The session exists and the hold still occupies the seat under hold_*.
         * Releasing here would let someone else take the seat while this guest
         * is on Stripe. The webhook looks the hold up by metadata.holdId.
         */
        console.error('Unable to attach Stripe session to class hold', error);
      }
    } catch (error) {
      await releaseHold(reservation.holdId);
      throw error;
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Unable to create class checkout', error);
    return NextResponse.json({ error: 'Unable to start class registration.' }, { status: 500 });
  }
}
