import crypto from 'crypto';

export type RestorableCartItem = { slug: string; quantity: number; size?: string | null };

type RestorePayload = {
  email: string;
  items: RestorableCartItem[];
  exp: number;
};

function signingKey() {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.CLASS_ACCESS_SECRET || '';
  if (!secret) return null;
  return crypto.createHash('sha256').update(`hillside-cart:${secret}`).digest();
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

export const CART_RESTORE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createCartRestoreToken(
  email: string,
  items: RestorableCartItem[],
  now = Date.now()
) {
  const key = signingKey();
  if (!key) return null;
  const payload: RestorePayload = {
    email: email.toLowerCase(),
    items: items.slice(0, 50).map((item) => ({
      slug: String(item.slug).slice(0, 140),
      quantity: Math.max(1, Math.min(20, Math.floor(item.quantity) || 1)),
      // A saved basket that forgot the size would come back as the wrong pot.
      ...(item.size ? { size: String(item.size).slice(0, 60) } : {})
    })),
    exp: now + CART_RESTORE_TTL_MS
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded, key)}`;
}

export function readCartRestoreToken(token: string): RestorePayload | null {
  const key = signingKey();
  if (!key || !token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature || !safeEqual(sign(encoded, key), signature)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as RestorePayload;
    if (!payload.email || !Array.isArray(payload.items) || !Number.isFinite(payload.exp))
      return null;
    if (payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * A saved cart stores quantities, not just rows. Restoring 5 when 2 remain
 * dropped 3 pieces even though the line count stayed one.
 */
export function cartRestoreDropped(
  requested: Array<{ quantity: number }>,
  restored: Array<{ quantity: number }>
) {
  const pieces = (items: Array<{ quantity: number }>) =>
    items.reduce((total, item) => total + Math.max(0, Number(item.quantity) || 0), 0);
  return Math.max(0, pieces(requested) - pieces(restored));
}
