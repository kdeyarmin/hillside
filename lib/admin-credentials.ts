import crypto from 'crypto';

/**
 * Admin passwords are stored, so they are stored hashed. scrypt is in node's
 * standard library, which keeps this dependency-free, and its work factor is
 * what makes a stolen `AdminUser` row expensive to crack offline rather than a
 * lookup away from plaintext.
 *
 * The stored string carries its own parameters — `scrypt$N$r$p$salt$hash` —
 * so the cost can be raised later without invalidating every existing hash.
 */
const KEY_LENGTH = 64;
const DEFAULT_COST = { N: 16384, r: 8, p: 1 };

export const MINIMUM_PASSWORD_LENGTH = 10;

function derive(password: string, salt: Buffer, cost: { N: number; r: number; p: number }) {
  return crypto.scryptSync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    ...cost,
    // 128 * N * r is scrypt's working set: 16 MB at the default cost. Node's own
    // ceiling is 32 MB, which a raised N would silently blow past.
    maxmem: 256 * cost.N * cost.r
  });
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const derived = derive(password, salt, DEFAULT_COST);
  const { N, r, p } = DEFAULT_COST;
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string) {
  if (!password || !stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const cost = { N: Number(rawN), r: Number(rawR), p: Number(rawP) };
  if (!Object.values(cost).every((value) => Number.isInteger(value) && value > 0)) return false;

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(rawHash, 'base64');
    if (expected.length !== KEY_LENGTH) return false;
    actual = derive(password, Buffer.from(rawSalt, 'base64'), cost);
  } catch {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}

/**
 * Sign-in is by email address, and people do not type their own address the
 * same way twice. Everything that looks the address up — the login form, the
 * account CLI — normalises through here so `Tjhill61111@Yahoo.com ` and
 * `tjhill61111@yahoo.com` are the same account rather than two.
 */
export function normalizeAdminEmail(value: string) {
  return value.trim().toLowerCase();
}

export function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Returns a problem to show the operator, or null when the password is usable. */
export function passwordComplaint(password: string) {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return `Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`;
  }
  if (password.trim() !== password) {
    return 'Password must not start or end with a space.';
  }
  return null;
}
