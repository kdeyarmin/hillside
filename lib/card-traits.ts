/**
 * The attributes a product card states outright, and the little a card needs to
 * render them.
 *
 * This is deliberately a module of its own, holding three facts per trait and
 * importing nothing. `ProductCard` is a client component rendered on the home
 * page, every collection, every product page's related grid and the shop, so
 * whatever it imports is downloaded by everyone who browses. The full attribute
 * vocabulary in `lib/product-tags.ts` carries groups, hints and the synonym
 * lists that make search work — none of which a card renders, and all of which
 * would ride along, because `tagLabel` and `normalizeTags` both close over a map
 * built from every tag.
 *
 * The vocabulary is still the source of truth for what these attributes *are*:
 * `tests/card-traits.test.ts` fails if a label or a type scope here stops
 * matching the entry in `PRODUCT_TAGS`, so the two cannot drift apart quietly.
 */

export type CardTrait = {
  /** The stored value in `Product.tags`. */
  slug: string;
  /** What the card prints. */
  label: string;
  /** The product types this attribute is asked of. */
  types: readonly string[];
};

/**
 * The two claims worth the space, in the order a card prints them.
 *
 * A card has room for a couple of quiet claims under its copy, not the whole
 * vocabulary — a grid where every card lists eight attributes is a grid nobody
 * reads. These two earn it because they are what a shopper chooses *between*
 * products on, and because both are answers only Tammy can give: whether a plant
 * will hurt somebody's cat is not a thing to infer from a description, or from
 * prose typed into a specification field.
 *
 * Derived attributes are deliberately absent. "New" and "best seller" are worked
 * out rather than declared and already have their own place on the card, so
 * repeating them here would put one fact in two spots.
 */
export const CARD_TRAITS: readonly CardTrait[] = [
  { slug: 'pet-safe', label: 'Pet safe', types: ['PLANT'] },
  { slug: 'beginner-friendly', label: 'Beginner friendly', types: ['PLANT'] }
];

/**
 * The claims one card makes about the product itself.
 *
 * Scoped by type as well as by what was ticked, so a `pet-safe` tag left behind
 * on a listing re-shelved as a soap is dropped rather than rendered — pet safety
 * is a question asked of plants.
 */
export function cardTraits(
  tags: readonly string[] | null | undefined,
  type?: string | null
): CardTrait[] {
  if (!tags?.length) return [];
  const claimed = new Set(tags.map((tag) => tag.trim().toLowerCase()));
  return CARD_TRAITS.filter(
    (trait) => claimed.has(trait.slug) && (!type || trait.types.includes(type))
  );
}
