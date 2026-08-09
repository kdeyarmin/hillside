import crypto from 'crypto';
import { cookies } from 'next/headers';

const cookieName = 'hillside-admin';
const sessionLengthMs = 12 * 60 * 60 * 1000;

type SessionPayload = { exp: number };

function signingKey() {
  const password = process.env.ADMIN_PASSWORD || '';
  const secret = process.env.ADMIN_SESSION_SECRET || '';
  if (!password || !secret) return null;
  return crypto.createHash('sha256').update(`${secret}:${password}`).digest();
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

export function verifyAdminPassword(candidate: string) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected || !process.env.ADMIN_SESSION_SECRET) return false;
  return safeEqual(candidate, expected);
}

export async function isAdmin() {
  const key = signingKey();
  if (!key) return false;
  const jar = await cookies();
  const token = jar.get(cookieName)?.value || '';
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature || !safeEqual(sign(encodedPayload, key), signature)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionPayload;
    return Number.isFinite(payload.exp) && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export async function setAdminSession() {
  const key = signingKey();
  if (!key) throw new Error('ADMIN_PASSWORD and ADMIN_SESSION_SECRET must both be configured.');
  const expiresAt = Date.now() + sessionLengthMs;
  const encodedPayload = Buffer.from(JSON.stringify({ exp: expiresAt } satisfies SessionPayload)).toString('base64url');
  const token = `${encodedPayload}.${sign(encodedPayload, key)}`;
  const jar = await cookies();
  jar.set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt)
  });
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(cookieName);
}
