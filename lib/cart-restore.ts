import crypto from 'crypto';

export type RestorableCartItem = { slug: string; quantity: number };

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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function createCartRestoreToken(email: string, items: RestorableCartItem[]) {
  const key = signingKey();
  if (!key) return null;
  const payload: RestorePayload = {
    email: email.toLowerCase(),
    items: items.slice(0, 50).map((item) => ({
      slug: String(item.slug).slice(0, 140),
      quantity: Math.max(1, Math.min(20, Math.floor(item.quantity) || 1))
    })),
    exp: Date.now() + THIRTY_DAYS_MS
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
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as RestorePayload;
    if (!payload.email || !Array.isArray(payload.items) || !Number.isFinite(payload.exp)) return null;
    if (payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
