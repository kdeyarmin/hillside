/**
 * What a basket line *is*, now that a line can be a set as well as a product.
 *
 * Bundles and products have separate slug spaces — nothing stops a "Succulent
 * Trio" bundle and a "succulent-trio" product existing side by side — so every
 * place that addresses a line has to say which of the two it means. Keyed on the
 * slug alone, adding the set would have quietly changed the quantity of the
 * product, and Remove would have taken the wrong one.
 */

import { cartLineKey } from './product-sizes.ts';
import { LINE_QUANTITY_MAX } from './store.ts';

export type LineKind = 'product' | 'bundle';

/** Anything that is not the literal string `bundle` is an ordinary product. */
export function readLineKind(value: unknown): LineKind {
  return String(value ?? '')
    .trim()
    .toLowerCase() === 'bundle'
    ? 'bundle'
    : 'product';
}

/**
 * The identity of a basket line. Products keep exactly the key they had, so
 * baskets saved before bundles existed read back unchanged; a set takes a key in
 * its own namespace. A set has no size — the recipe already pinned every variant
 * it contains — so none is folded in.
 */
export function basketLineKey(kind: LineKind, slug: string, size?: string | null) {
  return kind === 'bundle' ? `bundle::${slug}` : cartLineKey(slug, size);
}

/** Where a basket line's title should link. Sets live off /bundles, not /shop. */
export function lineHref(line: { kind?: LineKind | null; slug: string }) {
  return line.kind === 'bundle' ? `/bundles/${line.slug}` : `/shop/${line.slug}`;
}

/**
 * The most of this line a shopper may put in the basket — whichever of the shelf
 * and the per-order ceiling runs out first.
 */
export function lineCeiling(line: { inventory: number }) {
  return Math.min(Math.max(1, line.inventory), LINE_QUANTITY_MAX);
}

/**
 * Why the plus button stopped. A cap with no reason beside it reads as a broken
 * control — the product page already says "only N left", and the basket owes the
 * shopper the same sentence.
 */
export function lineCapNote(line: { inventory: number }) {
  if (line.inventory <= LINE_QUANTITY_MAX) {
    return `Only ${lineCeiling(line)} available.`;
  }
  return `${LINE_QUANTITY_MAX} is the most we sell in one order.`;
}
