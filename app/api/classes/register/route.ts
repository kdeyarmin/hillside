import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { ClassEvent } from '@prisma/client';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/request-body';
import { createFreeClassConfirmToken, freeClassConfirmExpiry } from '@/lib/class-confirm';
import { sendFreeClassConfirmEmail } from '@/lib/class-registration-email';
import { seatsShortLabel } from '@/lib/class-access';
import { claimFreeSeat } from '@/lib/class-seats';
import { honeypotFields, honeypotTripped } from '@/lib/honeypot';
import { rateLimited } from '@/lib/rate-limit';
import { absoluteUrl } from '@/lib/store';

export const runtime = 'nodejs';

const requestSchema = z.object({
  classId: z.string().min(1).max(100),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional().default(''),
  seats: z.coerce.number().int().min(1).max(6).default(1),
  /* Spam honeypot, under a name browsers do not autofill — see lib/honeypot.ts
     for why it must never be called `website` again. The old name is still
     accepted there so a cached page or an old bot still trips it. */
  ...honeypotFields
});

async function sendConfirmFor(
  event: Pick<ClassEvent, 'id' | 'title' | 'startsAt' | 'format' | 'location' | 'durationMinutes'>,
  registration: {
    id: string;
    name: string;
    email: string;
    seats: number;
    holdExpiresAt: Date | null;
  },
  resend = false
) {
  const expiresAt = registration.holdExpiresAt || freeClassConfirmExpiry(event.startsAt);
  const token = createFreeClassConfirmToken(
    registration.id,
    registration.email,
    event.id,
    expiresAt
  );
  if (!token) return { sent: false as const, reason: 'not-configured' as const };
  return sendFreeClassConfirmEmail({
    event,
    registration,
    confirmUrl: absoluteUrl(`/classes/confirm/${token}`),
    resend
  });
}

export async function POST(request: Request) {
  if (await rateLimited(request, { name: 'class-register', limit: 8, windowMs: 10 * 60_000 })) {
    return NextResponse.json(
      { error: 'Too many registration attempts. Please try again shortly.' },
      { status: 429 }
    );
  }

  try {
    const parsed = requestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Please check your name, email and seat count.' },
        { status: 400 }
      );
    }
    const input = parsed.data;
    if (honeypotTripped(input)) {
      return NextResponse.json({ ok: true, emailSent: true });
    }

    const event = await db.classEvent.findFirst({
      where: { id: input.classId, active: true }
    });
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
    if (event.priceCents > 0) {
      return NextResponse.json(
        { error: 'This class must be reserved through secure checkout.' },
        { status: 400 }
      );
    }

    const email = input.email.toLowerCase();
    const holdExpiresAt = freeClassConfirmExpiry(event.startsAt);
    const claim = await claimFreeSeat({
      classEventId: event.id,
      capacity: event.capacity,
      seats: input.seats,
      name: input.name,
      email,
      phone: input.phone || null,
      holdExpiresAt
    });

    if (!claim.ok) {
      if (claim.reason === 'duplicate' && claim.pending) {
        /**
         * Same person asking again before they clicked the first email. Resend
         * rather than occupying a second hold or telling them they already
         * registered when they have not confirmed yet.
         */
        const emailSent = (await sendConfirmFor(event, claim.pending, true)).sent;
        return NextResponse.json({
          ok: true,
          emailSent,
          message: emailSent
            ? 'We sent another confirmation email. Open it to finish reserving your seat.'
            : 'Your seat is held. We could not email the confirmation link, so please contact us.'
        });
      }
      if (claim.reason === 'duplicate') {
        return NextResponse.json(
          {
            error:
              'This email is already registered for the class. Contact us if you need to change the reservation.'
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: seatsShortLabel(claim.seatsLeft) }, { status: 400 });
    }

    /**
     * The seat is held from here on, so nothing below may return an error. The
     * registration comes back from the claiming transaction rather than a second
     * read, because that read was itself a way to fail after the seat was gone.
     */
    const registration = claim.registration;

    let emailSent = false;
    try {
      emailSent = (await sendConfirmFor(event, registration)).sent;
    } catch (error) {
      console.error(
        `Class registration ${registration.id} saved, but its confirm email failed`,
        error
      );
    }

    return NextResponse.json({
      ok: true,
      emailSent,
      message: emailSent
        ? 'Check your email and open the confirmation link to finish reserving your seat.'
        : 'Your seat is held. We could not send the confirmation email, so please contact us to finish registering.'
    });
  } catch (error) {
    console.error('Unable to register for free class', error);
    return NextResponse.json({ error: 'Unable to complete the registration.' }, { status: 500 });
  }
}
