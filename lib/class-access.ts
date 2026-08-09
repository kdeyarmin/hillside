import crypto from 'crypto';
import type { ClassEvent, ClassFormat } from '@prisma/client';

const TOKEN_BYTES = 32;
const COOKIE_PREFIX = 'hillside-class-access';

type WindowEvent = Pick<
  ClassEvent,
  | 'startsAt'
  | 'durationMinutes'
  | 'joinOpensMinutesBefore'
  | 'joinClosesMinutesAfter'
>;

type AccessPayload = {
  eventId: string;
  registrationId: string;
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
  expiresAt: Date
) {
  const payload: AccessPayload = {
    eventId,
    registrationId,
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
  if (event.format === 'ONLINE') return 'Online through Telnyx Video';
  if (event.format === 'HYBRID') return `${event.location} or online through Telnyx Video`;
  return event.location;
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
