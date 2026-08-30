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
import { rateLimited } from '@/lib/rate-limit';
import { reportError } from '@/lib/report-error';
import { siteBaseUrl } from '@/lib/store';
import {
  ensureTelnyxRoom,
  generateTelnyxJoinToken,
  telnyxVideoConfigured
} from '@/lib/telnyx-video';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The pinned build the classroom component is written against. */
const DEFAULT_SDK_URL = 'https://cdn.jsdelivr.net/npm/@telnyx/video@1.0.2/+esm';

/**
 * The classroom fetches the Telnyx SDK from whatever address this response
 * carries and hands it to `import()`, so this field is not a setting — it is
 * code, chosen by the server, executed in an attendee's browser with the shop's
 * own origin around it. An environment variable edited by mistake, or by someone
 * who got as far as the deploy dashboard, would be enough to run a script of
 * their choosing on the one page where customers are on camera.
 *
 * So the configured value is checked rather than trusted: HTTPS, and a host from
 * a list of two. This is half of the defence. The other half is the `script-src`
 * allowlist in next.config.ts, which admits `'self'` and cdn.jsdelivr.net and
 * nothing else — the same two origins as here, deliberately — so a browser
 * refuses a module from anywhere else even if this check were somehow passed.
 * Neither half is sufficient alone: a CSP is only enforced by browsers that
 * honour it, and this check only governs what the shop's own code asks for.
 * The two lists are meant to stay in step; widening one means widening the other.
 */
function allowedSdkHosts() {
  const hosts = new Set(['cdn.jsdelivr.net']);
  try {
    // The site's own origin, so a self-hosted copy of the SDK can be served
    // beside the rest of the shop. It has to be given as an absolute HTTPS URL.
    hosts.add(new URL(siteBaseUrl()).host);
  } catch {
    // `siteBaseUrl` refuses an unusable origin in production and falls back to
    // the canonical domain, so this is only reachable in development with a
    // malformed NEXT_PUBLIC_SITE_URL. The CDN stays allowed either way.
  }
  return hosts;
}

/**
 * Note that `NEXT_PUBLIC_` values are inlined when `next build` runs, so the
 * address checked here is the one the deployed build was compiled with — the
 * check happens per request, but a bad value arrives at deploy time and is
 * reported the first time somebody tries to join a class.
 */
function classroomSdkUrl() {
  const configured = process.env.NEXT_PUBLIC_TELNYX_VIDEO_SDK_URL?.trim();
  if (!configured || configured === DEFAULT_SDK_URL) return DEFAULT_SDK_URL;

  let url: URL | null = null;
  try {
    url = new URL(configured);
  } catch {
    url = null;
  }

  if (url && url.protocol === 'https:' && allowedSdkHosts().has(url.host)) return configured;

  reportError(
    'Refusing a Telnyx classroom SDK URL that is not on the allowlist',
    new Error('NEXT_PUBLIC_TELNYX_VIDEO_SDK_URL must be HTTPS on the site or on cdn.jsdelivr.net.'),
    { configured, allowed: [...allowedSdkHosts()] }
  );
  // The class still runs. Falling back to the pinned build keeps the classroom
  // working on the address it has always used, which is the safe answer as well
  // as the working one.
  return DEFAULT_SDK_URL;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Each success mints short-lived Telnyx credentials, which are billable. The
  // limit is generous enough for a genuine attendee reconnecting after a dropped
  // connection, and low enough that a valid cookie cannot be used to mint tokens
  // in a loop.
  if (await rateLimited(request, { name: 'video-token', limit: 30, windowMs: 10 * 60_000 })) {
    return NextResponse.json(
      { error: 'Too many attempts to join. Please wait a moment and reload the page.' },
      { status: 429 }
    );
  }

  const { id } = await params;
  const event = await db.classEvent.findUnique({ where: { id } });
  if (!event || !event.active || !isOnlineClass(event.format)) {
    return NextResponse.json({ error: 'Online classroom not found.' }, { status: 404 });
  }
  if (!telnyxVideoConfigured()) {
    return NextResponse.json(
      {
        error:
          'The online classroom is not available yet. Please contact us for help joining this class.'
      },
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
        sdkUrl: classroomSdkUrl()
      },
      { headers: { 'Cache-Control': 'no-store, private' } }
    );
  } catch (error) {
    // The message is logged, not returned: for an upstream failure it is the
    // video provider's own error text, which means nothing to a customer trying
    // to join a class and needlessly describes our infrastructure to anyone else.
    console.error('Unable to issue Telnyx classroom token', error);
    return NextResponse.json(
      {
        error: 'Unable to open the online classroom. Please reload, or contact us for help joining.'
      },
      { status: 502 }
    );
  }
}
