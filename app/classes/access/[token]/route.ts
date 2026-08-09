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

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 24 || token.length > 200) {
    return NextResponse.redirect(new URL('/classes?access=invalid', request.url));
  }

  const registration = await db.classRegistration.findUnique({
    where: { joinTokenHash: hashClassJoinToken(token) },
    include: { classEvent: true }
  });

  if (
    !registration ||
    registration.status !== 'PAID' ||
    !isOnlineClass(registration.classEvent.format)
  ) {
    return NextResponse.redirect(new URL('/classes?access=invalid', request.url));
  }

  const { closesAt } = classJoinWindow(registration.classEvent);
  if (closesAt <= new Date()) {
    return NextResponse.redirect(new URL('/classes?access=expired', request.url));
  }

  const expires = classAccessCookieExpiry(registration.classEvent);
  const cookie = createClassAccessCookie(
    registration.classEventId,
    registration.id,
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
