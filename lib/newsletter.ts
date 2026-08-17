import crypto from 'crypto';
import { absoluteUrl } from './store.ts';

/**
 * Signed, unexpiring unsubscribe tokens.
 *
 * A welcome email that cannot be opted out of is a CAN-SPAM problem and a
 * broken promise: the privacy policy already says subscribers may stop mail
 * at any time. The token is bound to the address, not to a database row, so
 * a later re-subscribe still unsubscribes the same inbox.
 *
 * No expiry on purpose. An email sitting in a mailbox for a year should
 * still honour "unsubscribe".
 */

function signingKey() {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.CLASS_ACCESS_SECRET || '';
  if (!secret) return null;
  return crypto.createHash('sha256').update(`hillside-newsletter:${secret}`).digest();
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

export function createUnsubscribeToken(email: string) {
  const key = signingKey();
  const normalized = email.trim().toLowerCase();
  if (!key || !normalized) return null;
  const encoded = Buffer.from(JSON.stringify({ email: normalized })).toString('base64url');
  return `${encoded}.${sign(encoded, key)}`;
}

export function readUnsubscribeToken(token: string): string | null {
  const key = signingKey();
  if (!key || !token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature || !safeEqual(sign(encoded, key), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      email?: unknown;
    };
    if (typeof payload.email !== 'string' || !payload.email.includes('@')) return null;
    return payload.email.toLowerCase();
  } catch {
    return null;
  }
}

export function unsubscribeUrl(email: string) {
  const token = createUnsubscribeToken(email);
  if (!token) return null;
  return absoluteUrl(`/newsletter/unsubscribe?token=${encodeURIComponent(token)}`);
}
