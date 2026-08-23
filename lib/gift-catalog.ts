import { cache } from 'react';
import { db } from './db.ts';
import { matchesGiftGuide, type GiftGuide } from './gifts.ts';
import { ratingsByProduct } from './reviews.ts';

/**
 * The shelf the gift pages are built from, read once per request.
 *
 * Only what is actually in stock. A gift guide answers "what can I send this
 * week?", and a sold-out card with a "tell me when it's back" link is a
 * different, slower promise — that one still lives on the shop and the product
 * page, where a shopper who wants *that* plant will find it.
 */
export const GIFT_CATALOG_LIMIT = 300;

/** Everything a gift page renders, plus the fields the matching rules read. */
const giftProductSelect = {
  id: true,
  slug: true,
  name: true,
  shortDescription: true,
  description: true,
  details: true,
  type: true,
  priceCents: true,
  compareAtCents: true,
  inventory: true,
  imageUrl: true,
  badge: true,
  sizes: true,
  sizeLabel: true,
  ships: true,
  pickup: true,
  featured: true,
  giftTags: true
} as const;

export type GiftCatalogProduct = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string;
  details: string | null;
  type: string;
  priceCents: number;
  compareAtCents: number | null;
  inventory: number;
  imageUrl: string | null;
  badge: string | null;
  sizes: unknown;
  sizeLabel: string | null;
  ships: boolean;
  pickup: boolean;
  featured: boolean;
  giftTags: string[];
  averageRating: number | null;
  reviewCount: number;
};

export const loadGiftCatalog = cache(async (): Promise<GiftCatalogProduct[]> => {
  const products = await db.product.findMany({
    where: { active: true, inventory: { gt: 0 } },
    select: giftProductSelect,
    orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    take: GIFT_CATALOG_LIMIT
  });

  const ratings = await ratingsByProduct(products.map((product) => product.id));
  return products.map((product) => ({
    ...product,
    averageRating: ratings.get(product.id)?.average ?? null,
    reviewCount: ratings.get(product.id)?.count ?? 0
  }));
});

export function giftGuideProducts(catalog: GiftCatalogProduct[], guide: GiftGuide) {
  return catalog.filter((product) => matchesGiftGuide(product, guide));
}

/**
 * The card's own fields, and nothing else. `details` is only here to be read by
 * the keyword rules; handing it to `ProductGrid` — a client component — would
 * serialize the long-form copy of the whole catalog into the page twice over.
 */
export function toGiftCard(product: GiftCatalogProduct) {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    type: product.type,
    priceCents: product.priceCents,
    compareAtCents: product.compareAtCents,
    inventory: product.inventory,
    imageUrl: product.imageUrl,
    badge: product.badge,
    sizes: product.sizes,
    sizeLabel: product.sizeLabel,
    ships: product.ships,
    pickup: product.pickup,
    averageRating: product.averageRating,
    reviewCount: product.reviewCount
  };
}
