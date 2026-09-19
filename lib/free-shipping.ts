/**
 * The free-shipping meter's arithmetic, in one place.
 *
 * The cart drawer, the cart page and the product page all tell a shopper how
 * far they are from free shipping. Each used to work it out for itself, and the
 * cart page's answer was a muted line at the very bottom of the summary, below
 * the button — which is to say the shop knew the one fact most likely to make
 * somebody add a second plant, and mentioned it last. This is the shared answer,
 * and it also says what crossing the line is *worth*: "add $6 more" persuades
 * nobody, "add $6 more and save $8.95 in postage" persuades most people.
 */

import { cheapestShippableCents, type SizeOption } from './product-sizes.ts';
import { formatMoney } from './store.ts';

export type FreeShippingProgress = {
  /** What is still missing from the basket. Zero once shipping is free. */
  remainingCents: number;
  /** How far along the meter is, 0–100. */
  percent: number;
  unlocked: boolean;
  /** The flat charge the threshold waives: what the shopper saves, or would. */
  savesCents: number;
  /**
   * The remaining amount is smaller than the postage it would waive — the one
   * moment when adding something to the basket is cheaper than not.
   */
  cheaperThanShipping: boolean;
};

/**
 * Null when the shop has no threshold, so every meter steps aside together
 * rather than each checking the figure for itself.
 */
export function freeShippingProgress({
  subtotalCents,
  thresholdCents,
  flatCents
}: {
  subtotalCents: number;
  thresholdCents: number;
  flatCents: number;
}): FreeShippingProgress | null {
  if (!(thresholdCents > 0)) return null;
  const subtotal = Math.max(0, subtotalCents);
  const remainingCents = Math.max(0, thresholdCents - subtotal);
  const unlocked = remainingCents === 0;
  const savesCents = Math.max(0, flatCents);
  return {
    remainingCents,
    percent: Math.min(100, Math.round((subtotal / thresholdCents) * 100)),
    unlocked,
    savesCents,
    cheaperThanShipping: !unlocked && savesCents > 0 && remainingCents < savesCents
  };
}

/** Whether adding something at this price carries the basket over the line. */
export function unlocksFreeShipping(progress: FreeShippingProgress | null, priceCents: number) {
  if (!progress || progress.unlocked) return false;
  return priceCents >= progress.remainingCents;
}

/**
 * Whether *offering* this product would carry the basket over the line.
 *
 * `unlocksFreeShipping` is arithmetic and will happily clear the threshold with
 * a pickup-only plant, which cannot ship at any price and would leave the
 * basket mixing pieces checkout refuses to sell together. So the two suggestion
 * strips — the drawer's and the cart page's — ask this one instead, and a
 * product with nothing shippable in it is never tagged.
 */
export function unlocksFreeShippingFor(
  progress: FreeShippingProgress | null,
  sizes: SizeOption[],
  product: { priceCents: number; ships?: boolean | null }
) {
  const from = cheapestShippableCents(sizes, product);
  return from !== null && unlocksFreeShipping(progress, from);
}

/**
 * The meter's sentence, in three pieces so the part worth setting in bold —
 * the amount still to add, or the fact that shipping is now free — can be.
 * Joined, they read as one sentence; tests check exactly that.
 */
export function freeShippingCopy(progress: FreeShippingProgress): {
  before: string;
  emphasis: string;
  after: string;
} {
  if (progress.unlocked) {
    return {
      before: '',
      emphasis: 'Free standard shipping unlocked',
      after:
        progress.savesCents > 0
          ? ` — you’re saving ${formatMoney(progress.savesCents)} on this order.`
          : ' on this order.'
    };
  }
  const tail = ' more for free standard shipping';
  if (progress.savesCents <= 0) {
    return { before: 'Add ', emphasis: formatMoney(progress.remainingCents), after: `${tail}.` };
  }
  return {
    before: 'Add ',
    emphasis: formatMoney(progress.remainingCents),
    after: progress.cheaperThanShipping
      ? `${tail} — less than the ${formatMoney(progress.savesCents)} it would cost to post.`
      : `${tail} and save the ${formatMoney(progress.savesCents)} postage.`
  };
}

/** The joined sentence, for anywhere that cannot set part of it in bold. */
export function freeShippingSentence(progress: FreeShippingProgress) {
  const copy = freeShippingCopy(progress);
  return `${copy.before}${copy.emphasis}${copy.after}`;
}
