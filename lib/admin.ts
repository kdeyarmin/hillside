import crypto from 'crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { hashPassword, normalizeAdminEmail, verifyPassword } from '@/lib/admin-credentials';

const cookieName = 'hillside-admin';
const sessionLengthMs = 12 * 60 * 60 * 1000;

/**
 * `sub` is the AdminUser id the session belongs to, or ENV_SUBJECT for a
 * sign-in against the shared ADMIN_PASSWORD. `iat` is what lets a password
 * change end the sessions that were opened with the old one.
 */
const ENV_SUBJECT = 'shared-password';
type SessionPayload = { sub: string; iat: number; exp: number };

export type AdminIdentity = { id: string; name: string; email: string } | { id: null; name: string; email: null };

function signingKey() {
  const secret = process.env.ADMIN_SESSION_SECRET || '';
  if (!secret) return null;
  /**
   * The shared password stays folded into the key so that rotating it in
   * Railway still invalidates every cookie signed under the old one. It is
   * optional now: with named accounts configured the site can run with
   * ADMIN_PASSWORD unset, and the key is then the secret alone.
   */
  return crypto.createHash('sha256').update(`${secret}:${process.env.ADMIN_PASSWORD || ''}`).digest();
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

function verifyAdminPassword(candidate: string) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected || !process.env.ADMIN_SESSION_SECRET) return false;
  return safeEqual(candidate, expected);
}

/**
 * Verifying a password costs scrypt's full work factor; finding no account at
 * all costs a single index lookup. Answering an unknown address measurably
 * faster than a known one tells an attacker which addresses have accounts, so
 * the miss is charged the same work against a hash of nothing.
 */
const decoyHash = hashPassword(crypto.randomBytes(32).toString('base64url'));

/**
 * Checks an email and password against the named admin accounts, falling back
 * to the shared ADMIN_PASSWORD so the owner is not locked out of a site whose
 * accounts have not been created yet. Returns the session subject to issue, or
 * null when neither matches.
 */
export async function authenticateAdmin(email: string, password: string) {
  const normalized = normalizeAdminEmail(email);
  const user = normalized ? await db.adminUser.findUnique({ where: { email: normalized } }) : null;

  if (user?.active) {
    if (verifyPassword(password, user.passwordHash)) {
      await db.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      return { subject: user.id, name: user.name };
    }
  } else {
    verifyPassword(password, decoyHash);
  }

  if (verifyAdminPassword(password)) return { subject: ENV_SUBJECT, name: 'Owner' };
  return null;
}

function readSession(token: string): SessionPayload | null {
  const key = signingKey();
  if (!key) return null;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature || !safeEqual(sign(encodedPayload, key), signature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionPayload;
    if (!Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
    /**
     * Cookies minted before admin accounts existed carry an expiry and nothing
     * else. Their signature is still valid, so they arrive here with no `sub`
     * at all — reading them as an account id looked up a user with an
     * `undefined` id, which Prisma rejects outright: everyone holding a
     * dashboard session at the moment of the deploy would have got a 500 on
     * every admin page until their cookie expired. They are shared-password
     * sessions, which is what they were issued as.
     */
    if (typeof payload.sub !== 'string' || !payload.sub) payload.sub = ENV_SUBJECT;
    return payload;
  } catch {
    return null;
  }
}

/**
 * The signed-in admin, or null. Every guard on the site goes through this, so
 * a deactivated account or a password change takes effect on the next request
 * rather than whenever the cookie happens to expire.
 */
export async function currentAdmin(): Promise<AdminIdentity | null> {
  const jar = await cookies();
  const payload = readSession(jar.get(cookieName)?.value || '');
  if (!payload) return null;

  if (payload.sub === ENV_SUBJECT) {
    return process.env.ADMIN_PASSWORD ? { id: null, name: 'Owner', email: null } : null;
  }

  const user = await db.adminUser.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, email: true, active: true, passwordChangedAt: true }
  });
  if (!user?.active) return null;
  // A session opened before the current password was set is no longer valid.
  if (Number.isFinite(payload.iat) && payload.iat < user.passwordChangedAt.getTime()) return null;

  return { id: user.id, name: user.name, email: user.email };
}

export async function isAdmin() {
  return (await currentAdmin()) !== null;
}

export async function setAdminSession(subject: string = ENV_SUBJECT) {
  const key = signingKey();
  if (!key) throw new Error('ADMIN_SESSION_SECRET must be configured.');
  const issuedAt = Date.now();
  const expiresAt = issuedAt + sessionLengthMs;
  const encodedPayload = Buffer.from(
    JSON.stringify({ sub: subject, iat: issuedAt, exp: expiresAt } satisfies SessionPayload)
  ).toString('base64url');
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
