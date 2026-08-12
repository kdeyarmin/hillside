import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  classAccessCookieExpiry,
  classAccessCookieName,
  classJoinWindow,
  createClassAccessCookie,
  hashClassJoinToken,
  isOnlineClass
} from '@/lib/class-access';
import { CLASSES_EXIT_LINK, CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';

export const runtime = 'nodejs';

/**
 * A link that no longer resolves has to land somewhere real. While the listing
 * page is public that is `/classes`, which renders the reason as an alert; while
 * it is hidden and answering 404, the reason has nowhere to be shown, so the
 * customer is sent to the page the confirmation email points them at instead.
 */
function accessFailure(reason: 'invalid' | 'expired', request: Request) {
  const destination = CLASSES_PUBLICLY_VISIBLE
    ? `/classes?access=${reason}`
    : CLASSES_EXIT_LINK.href;
  return NextResponse.redirect(new URL(destination, request.url));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 24 || token.length > 200) {
    return accessFailure('invalid', request);
  }

  const tokenHash = hashClassJoinToken(token);
  const registration = await db.classRegistration.findUnique({
    where: { joinTokenHash: tokenHash },
    include: { classEvent: true }
  });

  if (
    !registration ||
    registration.status !== 'PAID' ||
    !isOnlineClass(registration.classEvent.format)
  ) {
    return accessFailure('invalid', request);
  }

  const { closesAt } = classJoinWindow(registration.classEvent);
  if (closesAt <= new Date()) {
    return accessFailure('expired', request);
  }

  const expires = classAccessCookieExpiry(registration.classEvent);
  const cookie = createClassAccessCookie(
    registration.classEventId,
    registration.id,
    tokenHash,
    expires
  );
  const response = NextResponse.redirect(
    new URL(`/classes/studio/${registration.classEventId}`, request.url)
  );
  response.cookies.set(classAccessCookieName(registration.classEventId), cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires
  });
  return response;
}
