import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import {
  classFormatLabel,
  classLocationLabel,
  isOnlineClass
} from '@/lib/class-access';
import { absoluteUrl, normalizeHillsideDomain } from '@/lib/store';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
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

    const registrationTotals = await db.classRegistration.aggregate({
      where: { classEventId: event.id, status: 'PAID' },
      _sum: { seats: true }
    });
    const seatsLeft = Math.max(0, event.capacity - (registrationTotals._sum.seats || 0));
    if (seats > seatsLeft) {
      return NextResponse.json(
        { error: seatsLeft ? `Only ${seatsLeft} seats remain.` : 'This class is sold out.' },
        { status: 400 }
      );
    }

    const stripe = new Stripe(secret);
    const site = normalizeHillsideDomain(
      process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
    );
    const online = isOnlineClass(event.format);
    const session = await stripe.checkout.sessions.create({
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
      success_url: `${site}/classes/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/classes#class-${event.id}`,
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: true },
      invoice_creation: { enabled: true },
      allow_promotion_codes: true,
      payment_intent_data: {
        description: `The Hillside Gardens class: ${event.title}`,
        metadata: { kind: 'CLASS_REGISTRATION', classEventId: event.id }
      },
      custom_text: {
        submit: {
          message: online
            ? 'After payment, your private Hillside Telnyx classroom link will be emailed to you.'
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

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Unable to create class checkout', error);
    return NextResponse.json({ error: 'Unable to start class registration.' }, { status: 500 });
  }
}
