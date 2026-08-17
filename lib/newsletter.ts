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
 *
 * Sign with a dedicated newsletter secret when one is set. Verify against
 * that secret, a previous newsletter secret (so rotation does not break
 * year-old links), and the older admin / class fallbacks that already-sent
 * mail may have been signed with.
 */

function keyFromSecret(secret: string) {
  return crypto.createHash('sha256').update(`hillside-newsletter:${secret}`).digest();
}

function configuredSecrets() {
  const secrets = [
    process.env.NEWSLETTER_UNSUBSCRIBE_SECRET,
    process.env.NEWSLETTER_UNSUBSCRIBE_SECRET_PREVIOUS,
    process.env.ADMIN_SESSION_SECRET,
    process.env.CLASS_ACCESS_SECRET
  ]
    .map((value) => value?.trim() || '')
    .filter(Boolean);
  return [...new Set(secrets)];
}

function signingKeys() {
  return configuredSecrets().map(keyFromSecret);
}

function signingKey() {
  return signingKeys()[0] ?? null;
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
  const keys = signingKeys();
  if (!keys.length || !token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const matches = keys.some((key) => safeEqual(sign(encoded, key), signature));
  if (!matches) return null;
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
