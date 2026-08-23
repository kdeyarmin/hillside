/**
 * Reading the two codes a basket may carry out of a request body.
 *
 * Its own file, free of Prisma and Next, because three places need to agree on
 * it: the cart that sends them, the quote route that prices them and the
 * checkout route that charges them. It deliberately does no normalizing beyond
 * length — what a code *means* is `lib/discount-codes.ts`'s business, and a
 * value that survives to there is refused honestly rather than mangled into
 * some other customer's code on the way.
 */

/** Long enough for any code the shop issues, short enough not to be a payload. */
export const CODE_INPUT_MAX = 64;

export type DiscountCodeInput = { promoCode: string; giftCardCode: string };

function readCode(source: Record<string, unknown>, key: string) {
  const raw = source[key];
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, CODE_INPUT_MAX);
}

export function readDiscountCodes(body: unknown): DiscountCodeInput {
  if (!body || typeof body !== 'object') return { promoCode: '', giftCardCode: '' };
  const source = body as Record<string, unknown>;
  return {
    promoCode: readCode(source, 'promoCode'),
    giftCardCode: readCode(source, 'giftCardCode')
  };
}

/**
 * The last group of a gift card number — `SHPM` — which is how a card is named
 * anywhere too narrow for the whole thing: a summary row, a receipt line, the
 * dashboard's list. It is also all of a code that may safely be written down
 * somewhere the customer might forward.
 */
export function giftCardTail(code: string) {
  return code.split('-').at(-1) || code.slice(-4);
}
