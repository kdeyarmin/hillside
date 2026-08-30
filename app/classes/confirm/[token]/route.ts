import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createClassJoinCredential, isOnlineClass } from '@/lib/class-access';
import { readFreeClassConfirmToken } from '@/lib/class-confirm';
import { sendClassRegistrationEmails } from '@/lib/class-registration-email';
import { CLASSES_EXIT_LINK, CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';

export const runtime = 'nodejs';

function confirmFailure(reason: 'invalid' | 'expired', request: Request) {
  const destination = CLASSES_PUBLICLY_VISIBLE
    ? `/classes?confirm=${reason}`
    : CLASSES_EXIT_LINK.href;
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 24 || token.length > 800) {
    return confirmFailure('invalid', request);
  }

  const payload = readFreeClassConfirmToken(token);
  if (!payload) return confirmFailure('expired', request);

  const registration = await db.classRegistration.findUnique({
    where: { id: payload.registrationId },
    include: { classEvent: true }
  });

  if (
    !registration ||
    registration.email.toLowerCase() !== payload.email ||
    registration.classEventId !== payload.classEventId
  ) {
    return confirmFailure('invalid', request);
  }

  if (registration.status === 'PAID') {
    return NextResponse.redirect(new URL('/classes/confirmed', request.url), {
      headers: { 'Referrer-Policy': 'no-referrer' }
    });
  }

  if (registration.status !== 'PENDING') {
    return confirmFailure('invalid', request);
  }

  if (registration.classEvent.startsAt <= new Date()) {
    return confirmFailure('expired', request);
  }

  const credential = isOnlineClass(registration.classEvent.format)
    ? createClassJoinCredential()
    : null;

  const claimed = await db.classRegistration.updateMany({
    where: { id: registration.id, status: 'PENDING' },
    data: {
      status: 'PAID',
      holdExpiresAt: null,
      joinTokenHash: credential?.hash || null
    }
  });

  if (claimed.count === 0) {
    const winner = await db.classRegistration.findUnique({ where: { id: registration.id } });
    if (winner?.status === 'PAID') {
      return NextResponse.redirect(new URL('/classes/confirmed', request.url), {
        headers: { 'Referrer-Policy': 'no-referrer' }
      });
    }
    return confirmFailure('expired', request);
  }

  const updated = await db.classRegistration.findUnique({ where: { id: registration.id } });
  if (updated) {
    try {
      await sendClassRegistrationEmails({
        event: registration.classEvent,
        registration: updated,
        accessToken: credential?.token
      });
    } catch (error) {
      console.error(`Confirmed class registration ${registration.id}, but its email failed`, error);
    }
  }

  return NextResponse.redirect(new URL('/classes/confirmed', request.url), {
    headers: { 'Referrer-Policy': 'no-referrer' }
  });
}
