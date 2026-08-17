import crypto from 'crypto';

type ConfirmPayload = {
  registrationId: string;
  email: string;
  classEventId: string;
  exp: number;
};

function signingKey() {
  const secret = process.env.CLASS_ACCESS_SECRET || process.env.ADMIN_SESSION_SECRET || '';
  if (!secret) return null;
  return crypto.createHash('sha256').update(`hillside-class-confirm:${secret}`).digest();
}

function sign(value: string, key: Buffer) {
  return crypto.createHmac('sha256', key).update(value).digest('base64url');
}

function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
  } catch {
    return false;
  }
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function freeClassConfirmExpiry(startsAt: Date, now = new Date()) {
  const untilClass = startsAt.getTime() - now.getTime();
  const holdMs = Math.min(TWENTY_FOUR_HOURS_MS, Math.max(30 * 60_000, untilClass));
  return new Date(now.getTime() + holdMs);
}

export function createFreeClassConfirmToken(
  registrationId: string,
  email: string,
  classEventId: string,
  expiresAt: Date
) {
  const key = signingKey();
  if (!key) return null;
  const payload: ConfirmPayload = {
    registrationId,
    email: email.toLowerCase(),
    classEventId,
    exp: expiresAt.getTime()
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded, key)}`;
}

export function readFreeClassConfirmToken(token: string): ConfirmPayload | null {
  const key = signingKey();
  if (!key || !token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature || !safeEqual(sign(encoded, key), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ConfirmPayload;
    if (
      !payload.registrationId ||
      !payload.email ||
      !payload.classEventId ||
      !Number.isFinite(payload.exp)
    ) {
      return null;
    }
    if (payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
