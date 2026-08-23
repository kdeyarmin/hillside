/**
 * Minting and reading back the codes on a gift card or a promo slip.
 *
 * Kept free of Prisma and Next so `npm test` can cover the part that has to be
 * right before anything is printed: a card whose code cannot be typed back in
 * is money the customer cannot spend, and there is no second copy of it.
 */

import crypto from 'crypto';

/**
 * Crockford's base32 — the digits and the capitals, minus I, L, O and U.
 *
 * The first three are dropped because a printed 1 and I, or 0 and O, are the
 * same character to somebody copying a code off a card by hand. U is dropped
 * because leaving it in is how a randomly generated code spells something the
 * shop would rather not have printed on a gift for somebody's mother.
 */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * What a reader of a printed card most likely meant. Applied before the code is
 * looked up, so a card typed with the letter O where the zero is still works.
 */
const CONFUSABLE: Record<string, string> = { O: '0', I: '1', L: '1', U: 'V' };

/** Sixteen characters — eighty bits — in the four groups the card is printed in. */
export const GIFT_CARD_CODE_LENGTH = 16;
export const GIFT_CARD_CODE_GROUP = 4;

/** The random tail on a generated promo code, after any prefix. */
export const PROMO_CODE_RANDOM_LENGTH = 6;

/** What a promo code may be made of once normalized, and how long it may be. */
export const PROMO_CODE_MAX = 40;
const PROMO_CODE_ALLOWED = /[^A-Z0-9_-]/g;

/**
 * A source of random indices into `CODE_ALPHABET`. `crypto.randomInt` rather
 * than `Math.random`, because a gift card code is a bearer token: anyone who
 * can guess one can spend it. Injectable so the tests can drive the shape of a
 * code without asserting on real randomness.
 */
export type RandomIndex = (exclusiveMax: number) => number;

const secureIndex: RandomIndex = (exclusiveMax) => crypto.randomInt(0, exclusiveMax);

export function randomCodeChars(length: number, random: RandomIndex = secureIndex) {
  let code = '';
  for (let position = 0; position < length; position += 1) {
    code += CODE_ALPHABET[random(CODE_ALPHABET.length)];
  }
  return code;
}

/** Groups a bare code into the printed form: `H3K9-2QWM-7RTF-A4X1`. */
export function formatGiftCardCode(raw: string) {
  const cleaned = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const groups: string[] = [];
  for (let start = 0; start < cleaned.length; start += GIFT_CARD_CODE_GROUP) {
    groups.push(cleaned.slice(start, start + GIFT_CARD_CODE_GROUP));
  }
  return groups.join('-');
}

export function generateGiftCardCode(random: RandomIndex = secureIndex) {
  return formatGiftCardCode(randomCodeChars(GIFT_CARD_CODE_LENGTH, random));
}

/**
 * A typed gift card code as it is stored, or null when it could not be one.
 *
 * Spacing and hyphens are the customer's business, not ours: a code read off a
 * card, pasted out of an email or typed in one run all arrive here differently
 * and have to reach the same row. Confusable characters are folded the same
 * way, which is the whole reason the alphabet excludes them.
 */
export function normalizeGiftCardCode(input: unknown): string | null {
  const stripped = String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (stripped.length !== GIFT_CARD_CODE_LENGTH) return null;

  let folded = '';
  for (const character of stripped) {
    const resolved = CONFUSABLE[character] ?? character;
    // A character that is not in the alphabet even after folding cannot be part
    // of a code this shop issued, so the whole value is refused rather than
    // silently rewritten into a code belonging to somebody else.
    if (!CODE_ALPHABET.includes(resolved)) return null;
    folded += resolved;
  }
  return formatGiftCardCode(folded);
}

/**
 * The code with all but its last group hidden, for a list the owner scrolls
 * past. The full code stays one click away — she has to be able to read it back
 * to a customer on the phone — but it is not printed forty times over on a page
 * that might be on screen in a shop.
 */
export function maskGiftCardCode(code: string) {
  const groups = formatGiftCardCode(code).split('-');
  if (groups.length <= 1) return groups.join('-');
  return [...groups.slice(0, -1).map((group) => '•'.repeat(group.length)), groups.at(-1)].join('-');
}

/**
 * A promo code as it is stored and compared: upper case, with anything that is
 * neither a letter, a digit, a hyphen nor an underscore dropped. Hyphens are
 * kept because the owner writes them deliberately — MARKET-2026 — and dropping
 * them would leave the code she is looking at on her screen different from the
 * one in the database.
 */
export function normalizePromoCode(input: unknown) {
  return String(input ?? '')
    .toUpperCase()
    .replace(PROMO_CODE_ALLOWED, '')
    .slice(0, PROMO_CODE_MAX);
}

/** Whether a normalized promo code is something a customer could be given. */
export function isValidPromoCode(code: string) {
  return code.length >= 3 && code.length <= PROMO_CODE_MAX && /[A-Z0-9]/.test(code);
}

/**
 * A generated promo code, optionally under a prefix the owner recognises:
 * `MARKET-7KQ2WD`. The prefix is normalized too, so a batch named "Spring Fair"
 * yields SPRINGFAIR-… rather than a code with a space in it that nothing can
 * look up.
 */
export function generatePromoCode(prefix = '', random: RandomIndex = secureIndex) {
  const head = normalizePromoCode(prefix).replace(/-+$/, '');
  const tail = randomCodeChars(PROMO_CODE_RANDOM_LENGTH, random);
  const code = head ? `${head}-${tail}` : tail;
  return code.slice(0, PROMO_CODE_MAX);
}

/**
 * `count` distinct codes.
 *
 * Deduplicated within the run because a batch is written in one transaction,
 * and a repeat inside it would fail the unique index and take the other
 * forty-nine codes down with it. Collisions are vanishingly unlikely at these
 * lengths; the point is that the failure they would cause is not proportionate
 * to their odds. `attemptsPerCode` bounds the loop so a caller that asks for
 * more codes than the alphabet can make cannot spin forever.
 */
export function generateUniqueCodes(
  count: number,
  make: () => string,
  attemptsPerCode = 12
): string[] {
  const codes = new Set<string>();
  const ceiling = Math.max(0, Math.floor(count)) * attemptsPerCode;
  for (let attempt = 0; codes.size < count && attempt < ceiling; attempt += 1) {
    codes.add(make());
  }
  return [...codes];
}
