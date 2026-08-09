import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import {
  classAccessCookieName,
  classJoinWindow,
  isOnlineClass,
  verifyClassAccessCookie
} from '@/lib/class-access';
import { db } from '@/lib/db';
import {
  ensureTelnyxRoom,
  generateTelnyxJoinToken,
  telnyxVideoConfigured
} from '@/lib/telnyx-video';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const event = await db.classEvent.findUnique({ where: { id } });
  if (!event || !event.active || !isOnlineClass(event.format)) {
    return NextResponse.json({ error: 'Online classroom not found.' }, { status: 404 });
  }
  if (!telnyxVideoConfigured()) {
    return NextResponse.json(
      { error: 'Telnyx Video is not configured yet. Tammy has been notified.' },
      { status: 503 }
    );
  }

  const owner = await isAdmin();
  let registrationId: string | null = null;

  if (!owner) {
    const jar = await cookies();
    const access = verifyClassAccessCookie(
      jar.get(classAccessCookieName(event.id))?.value,
      event.id
    );
    if (!access) {
      return NextResponse.json(
        { error: 'Open the private classroom link from your confirmation email first.' },
        { status: 401 }
      );
    }

    const registration = await db.classRegistration.findFirst({
      where: {
        id: access.registrationId,
        classEventId: event.id,
        joinTokenHash: access.tokenHash,
        status: 'PAID'
      }
    });
    if (!registration) {
      return NextResponse.json(
        { error: 'Your access link has been replaced or your registration is not active.' },
        { status: 403 }
      );
    }
    registrationId = registration.id;

    const { opensAt, closesAt } = classJoinWindow(event);
    const now = new Date();
    if (now < opensAt) {
      return NextResponse.json(
        {
          error: `The classroom opens ${event.joinOpensMinutesBefore} minutes before class.`,
          opensAt: opensAt.toISOString()
        },
        { status: 425 }
      );
    }
    if (now > closesAt) {
      return NextResponse.json({ error: 'This online classroom has closed.' }, { status: 410 });
    }
  }

  try {
    const roomId = await ensureTelnyxRoom(event);
    if (!roomId) throw new Error('Unable to prepare the online classroom.');
    const credentials = await generateTelnyxJoinToken(roomId);
    if (registrationId) {
      await db.classRegistration.update({
        where: { id: registrationId },
        data: { lastJoinedAt: new Date() }
      });
    }

    return NextResponse.json(
      {
        roomId,
        clientToken: credentials.token,
        expiresAt: credentials.expiresAt,
        sdkUrl:
          process.env.NEXT_PUBLIC_TELNYX_VIDEO_SDK_URL ||
          'https://cdn.jsdelivr.net/npm/@telnyx/video@1.0.2/+esm'
      },
      { headers: { 'Cache-Control': 'no-store, private' } }
    );
  } catch (error) {
    console.error('Unable to issue Telnyx classroom token', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to open the online classroom.' },
      { status: 502 }
    );
  }
}
