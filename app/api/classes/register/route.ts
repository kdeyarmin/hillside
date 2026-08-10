import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createClassJoinCredential, isOnlineClass } from '@/lib/class-access';
import { seatsRemaining } from '@/lib/class-seats';
import { sendClassRegistrationEmails } from '@/lib/class-registration-email';
import { rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const requestSchema = z.object({
  classId: z.string().min(1).max(100),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional().default(''),
  seats: z.coerce.number().int().min(1).max(6).default(1),
  website: z.string().max(0).optional().default('')
});

export async function POST(request: Request) {
  if (rateLimited(request, { name: 'class-register', limit: 8, windowMs: 10 * 60_000 })) {
    return NextResponse.json({ error: 'Too many registration attempts. Please try again shortly.' }, { status: 429 });
  }

  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Please check your name, email and seat count.' }, { status: 400 });
    }
    const input = parsed.data;
    if (input.website) return NextResponse.json({ ok: true, emailSent: true });

    const event = await db.classEvent.findFirst({
      where: { id: input.classId, active: true }
    });
    if (!event || event.startsAt <= new Date()) {
      return NextResponse.json({ error: 'This class is no longer open for registration.' }, { status: 400 });
    }
    if (event.registrationDeadline && event.registrationDeadline <= new Date()) {
      return NextResponse.json({ error: 'Registration for this class has closed.' }, { status: 400 });
    }
    if (event.priceCents > 0) {
      return NextResponse.json({ error: 'This class must be reserved through secure checkout.' }, { status: 400 });
    }

    const email = input.email.toLowerCase();
    const existing = await db.classRegistration.findFirst({
      where: {
        classEventId: event.id,
        email,
        status: { in: ['PENDING', 'PAID'] }
      }
    });
    if (existing) {
      return NextResponse.json(
        { error: 'This email is already registered for the class. Contact us if you need to change the reservation.' },
        { status: 409 }
      );
    }

    const seatsLeft = await seatsRemaining(event.id, event.capacity);
    if (input.seats > seatsLeft) {
      return NextResponse.json(
        { error: seatsLeft ? `Only ${seatsLeft} seats remain.` : 'This class is sold out.' },
        { status: 400 }
      );
    }

    const credential = isOnlineClass(event.format) ? createClassJoinCredential() : null;
    const registration = await db.classRegistration.create({
      data: {
        classEventId: event.id,
        stripeSessionId: `free_${crypto.randomUUID()}`,
        name: input.name,
        email,
        phone: input.phone || null,
        seats: input.seats,
        amountCents: 0,
        status: 'PAID',
        joinTokenHash: credential?.hash || null
      }
    });

    const emailResult = await sendClassRegistrationEmails({
      event,
      registration,
      accessToken: credential?.token
    });

    return NextResponse.json({
      ok: true,
      emailSent: emailResult.sent,
      message: emailResult.sent
        ? 'Your registration is confirmed. Check your email for the class details.'
        : 'Your registration is confirmed. Email delivery is not configured, so please contact us for the class link.'
    });
  } catch (error) {
    console.error('Unable to register for free class', error);
    return NextResponse.json({ error: 'Unable to complete the registration.' }, { status: 500 });
  }
}
