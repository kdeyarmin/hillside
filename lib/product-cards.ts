/**
 * What a product card needs beyond its own row, gathered once.
 *
 * Every page that renders a grid was repeating the ratings enrichment inline,
 * four lines at a time, and the category flattening beside it. Both live here
 * now, together with the merchandising labels, so a card cannot be badged one
 * way in the shop and another in a collection.
 *
 * The thresholds and overrides behind the labels are `lib/merchandising.ts`;
 * the queries that count them are `lib/merchandising-data.ts`. This module only
 * assembles what a card renders.
 */

import { withCategory } from '@/lib/product-categories';
import { merchandisingFlagsFor, type MerchandisingFlags } from '@/lib/merchandising-data';
import { ratingsByProduct } from '@/lib/reviews';

export { PRODUCT_CARD_SELECT, type MerchandisedProduct } from '@/lib/merchandising-data';

export type CardFacts = {
  averageRating: number | null;
  reviewCount: number;
  categorySlug: string | null;
  categoryTitle: string | null;
  flags: MerchandisingFlags | undefined;
};

type Flaggable = Parameters<typeof merchandisingFlagsFor>[0][number];

/**
 * Adds the things a card knows that its own row does not: how it has been
 * reviewed, its category flattened to the two strings the pill renders, and the
 * automatic merchandising labels.
 *
 * Decided on the server rather than in the card, which is a client component:
 * comparing a listing date to `Date.now()` during render would be answered once
 * on the server and again in the browser, and a product that crossed the line
 * between the two would hydrate into a mismatch.
 */
export async function withCardFacts<
  T extends Flaggable & {
    id: string;
    category?: { slug: string; title: string } | null;
  }
>(products: T[]): Promise<Array<Omit<T, 'category'> & CardFacts>> {
  if (!products.length) return [];
  const [ratings, flags] = await Promise.all([
    ratingsByProduct(products.map((product) => product.id)),
    merchandisingFlagsFor(products)
  ]);

  return products.map((product) => ({
    ...withCategory(product),
    averageRating: ratings.get(product.id)?.average ?? null,
    reviewCount: ratings.get(product.id)?.count ?? 0,
    flags: flags.get(product.id)
  }));
}
