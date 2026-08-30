import crypto from 'crypto';
import type { ClassEvent, ClassFormat } from '@prisma/client';

const TOKEN_BYTES = 32;
const COOKIE_PREFIX = 'hillside-class-access';

type WindowEvent = Pick<
  ClassEvent,
  'startsAt' | 'durationMinutes' | 'joinOpensMinutesBefore' | 'joinClosesMinutesAfter'
>;

type AccessPayload = {
  eventId: string;
  registrationId: string;
  tokenHash: string;
  exp: number;
};

function accessSecret() {
  const secret = process.env.CLASS_ACCESS_SECRET || process.env.ADMIN_SESSION_SECRET || '';
  if (!secret) throw new Error('CLASS_ACCESS_SECRET or ADMIN_SESSION_SECRET must be configured.');
  return crypto.createHash('sha256').update(secret).digest();
}

function sign(value: string) {
  return crypto.createHmac('sha256', accessSecret()).update(value).digest('base64url');
}

function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
  } catch {
    return false;
  }
}

export function classAccessCookieName(eventId: string) {
  return `${COOKIE_PREFIX}-${eventId}`;
}

export function createClassJoinCredential() {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, hash: hashClassJoinToken(token) };
}

export function hashClassJoinToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createClassAccessCookie(
  eventId: string,
  registrationId: string,
  tokenHash: string,
  expiresAt: Date
) {
  const payload: AccessPayload = {
    eventId,
    registrationId,
    tokenHash,
    exp: expiresAt.getTime()
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifyClassAccessCookie(value: string | undefined, eventId: string) {
  if (!value) return null;
  const [encoded, signature] = value.split('.');
  if (!encoded || !signature || !safeEqual(sign(encoded), signature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AccessPayload;
    if (
      payload.eventId !== eventId ||
      !payload.registrationId ||
      !payload.tokenHash ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function isOnlineClass(format: ClassFormat | string) {
  return format === 'ONLINE' || format === 'HYBRID';
}

export function classFormatLabel(format: ClassFormat | string) {
  if (format === 'ONLINE') return 'Online class';
  if (format === 'HYBRID') return 'Online + in-person';
  return 'In-person workshop';
}

export function classLocationLabel(event: Pick<ClassEvent, 'format' | 'location'>) {
  if (event.format === 'ONLINE') return 'Online, live in your browser';
  if (event.format === 'HYBRID') return `${event.location}, or online in your browser`;
  return event.location;
}

/**
 * Class times are entered and stored against the server's clock, so the same
 * zone formats them back. Naming that zone is the point: an unlabelled "6:00 PM"
 * is a real question for anyone joining an online class from another state.
 * Deployments should set `TZ` to the shop's timezone so this reads, say, "EDT"
 * rather than "UTC".
 */
export function classDateLabel(startsAt: Date, options: { year?: boolean } = {}) {
  return startsAt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(options.year === false ? {} : { year: 'numeric' })
  });
}

export function classTimeLabel(startsAt: Date) {
  return startsAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

export function seatsRemainingLabel(seatsLeft: number) {
  return `${seatsLeft} ${seatsLeft === 1 ? 'seat' : 'seats'} remaining`;
}

/**
 * What a guest is told when they ask for more seats than are left. The two
 * booking endpoints each wrote this inline and each read "Only 1 seats remain."
 * to the person taking the very last place in a class.
 */
export function seatsShortLabel(seatsLeft: number) {
  if (seatsLeft <= 0) return 'This class is sold out.';
  return `Only ${seatsLeft} ${seatsLeft === 1 ? 'seat remains' : 'seats remain'}.`;
}

export function classJoinWindow(event: WindowEvent) {
  const opensAt = new Date(
    event.startsAt.getTime() - Math.max(0, event.joinOpensMinutesBefore) * 60_000
  );
  const classEndsAt = new Date(
    event.startsAt.getTime() + Math.max(15, event.durationMinutes) * 60_000
  );
  const closesAt = new Date(
    classEndsAt.getTime() + Math.max(0, event.joinClosesMinutesAfter) * 60_000
  );
  return { opensAt, classEndsAt, closesAt };
}

export function classAccessCookieExpiry(event: WindowEvent) {
  return classJoinWindow(event).closesAt;
}
