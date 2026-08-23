/**
 * The shop's filter rail: which filters exist, which of them are worth showing
 * for what is currently on screen, and whether a product answers a filter.
 *
 * The rule this file exists to enforce is that a filter is only offered when
 * something on the shelf answers to it. A shop showing nothing but soap has no
 * business asking about light requirements, and a "Best seller" checkbox that
 * would empty the grid is worse than no checkbox at all. So every option is
 * counted against the products actually in scope, and anything that counts zero
 * is dropped — unless the shopper has it selected, because a filter you cannot
 * see is a filter you cannot undo.
 *
 * Pure, and shared by the server (which parses the query string) and the shop's
 * client component (which does the filtering), so a bookmarked filtered URL and
 * the rail that produced it cannot disagree.
 */

import { groupTags, tagsForTypes, type ProductTag, tagLabel } from './product-tags.ts';
import { CATEGORY_GROUPS, categoryTypes, productTypeLabel } from './store.ts';

export const PRICE_BANDS = [
  { key: 'under-15', label: 'Under $15', minCents: 0, maxCents: 1500 },
  { key: '15-30', label: '$15 to $30', minCents: 1500, maxCents: 3000 },
  { key: '30-60', label: '$30 to $60', minCents: 3000, maxCents: 6000 },
  { key: '60-plus', label: '$60 and up', minCents: 6000, maxCents: Number.MAX_SAFE_INTEGER }
] as const;

export type PriceBandKey = (typeof PRICE_BANDS)[number]['key'];

export type ShopFilterState = {
  /** A `CATEGORY_GROUPS` key, a bare ProductType, or `ALL`. */
  category: string;
  /** Collection slug, or empty for every collection. */
  collection: string;
  /** A `PRICE_BANDS` key, or empty. */
  price: string;
  /**
   * Attribute slugs, assignable or derived. All must match.
   *
   * "On sale" lives here rather than in a flag of its own. It used to be both —
   * a boolean *and* a derived tag — which meant two ways to express one filter
   * and a chip the shopper could tick but not untick, because the toggle wrote
   * the tag while the flag stayed set.
   */
  tags: string[];
  search: string;
  sort: string;
};

export const EMPTY_FILTERS: ShopFilterState = {
  category: 'ALL',
  collection: '',
  price: '',
  tags: [],
  search: '',
  sort: 'featured'
};

export type FilterableProduct = {
  id: string;
  type: string;
  /**
   * Every price a shopper can actually pay: one per size, or the single price
   * when the product is sold one way.
   *
   * Deliberately the real prices rather than the range they span. Testing a
   * band against the span put a plant sold at $12 and $40 into "$15 to $30",
   * where nothing about it can be bought — a filter answering with something
   * the shopper cannot buy at the price they asked for.
   */
  prices: readonly number[];
  /** Every attribute, assigned and derived. */
  tags: readonly string[];
  collectionSlugs: readonly string[];
};

function inPriceBand(product: FilterableProduct, key: string) {
  const band = PRICE_BANDS.find((entry) => entry.key === key);
  if (!band) return true;
  // A product sold in several sizes belongs to every band one of its sizes
  // falls in — a $12–$40 plant answers "under $15" and "$30 to $60", and
  // neither of the bands in between.
  return product.prices.some((price) => price >= band.minCents && price < band.maxCents);
}

function inCategory(product: FilterableProduct, category: string) {
  const types = categoryTypes(category);
  return !types.length || types.includes(product.type);
}

/** Whether one product answers a filter state. Search and sort are not ours. */
export function matchesFilters(product: FilterableProduct, state: ShopFilterState) {
  if (!inCategory(product, state.category)) return false;
  if (state.collection && !product.collectionSlugs.includes(state.collection)) return false;
  if (state.price && !inPriceBand(product, state.price)) return false;
  return state.tags.every((tag) => product.tags.includes(tag));
}

export type FilterOption = { value: string; label: string; count: number; selected: boolean };
export type FilterFacet = {
  key: string;
  label: string;
  /** `one` renders as a dropdown, `many` as toggle chips. */
  choice: 'one' | 'many';
  options: FilterOption[];
};

/**
 * Products matching everything *except* the facet being counted. Counting inside
 * a facet's own selection would show "Pet safe (3)" next to a rail already
 * filtered to pet-safe plants, which tells the shopper nothing about what
 * ticking the next box would do.
 */
function scopeFor(
  products: FilterableProduct[],
  state: ShopFilterState,
  override: Partial<ShopFilterState>
) {
  const scoped = { ...state, ...override };
  return products.filter((product) => matchesFilters(product, scoped));
}

function buildOptions(
  candidates: Array<{ value: string; label: string }>,
  scope: FilterableProduct[],
  selected: (value: string) => boolean,
  test: (product: FilterableProduct, value: string) => boolean
): FilterOption[] {
  return (
    candidates
      .map((candidate) => ({
        ...candidate,
        count: scope.filter((product) => test(product, candidate.value)).length,
        selected: selected(candidate.value)
      }))
      // A zero-count option is a dead end; a selected one stays so it can be undone.
      .filter((option) => option.count > 0 || option.selected)
  );
}

/**
 * The filter rail for a set of products and the filters already applied.
 *
 * `products` is everything the page could show — the unfiltered catalog for the
 * shop, one collection's products for a category page — because a facet's
 * counts have to describe what selecting it would do, not what is left after it
 * already has been.
 */
export function buildFacets(
  products: FilterableProduct[],
  state: ShopFilterState,
  collections: ReadonlyArray<{ slug: string; title: string }> = []
): FilterFacet[] {
  const facets: FilterFacet[] = [];

  const categoryScope = scopeFor(products, state, { category: 'ALL' });
  const presentTypes = Array.from(new Set(categoryScope.map((product) => product.type)));
  const grouped = new Set(Object.values(CATEGORY_GROUPS).flatMap((group) => group.types));
  const categoryCandidates = [
    ...Object.entries(CATEGORY_GROUPS).map(([key, group]) => ({ value: key, label: group.label })),
    ...presentTypes
      .filter((type) => !grouped.has(type))
      .map((type) => ({ value: type, label: productTypeLabel(type) }))
  ];
  const categoryOptions = buildOptions(
    categoryCandidates,
    categoryScope,
    (value) => state.category === value,
    (product, value) => inCategory(product, value)
  );
  if (categoryOptions.length > 1) {
    facets.push({ key: 'category', label: 'Category', choice: 'one', options: categoryOptions });
  }

  if (collections.length) {
    const collectionScope = scopeFor(products, state, { collection: '' });
    const collectionOptions = buildOptions(
      collections.map((collection) => ({ value: collection.slug, label: collection.title })),
      collectionScope,
      (value) => state.collection === value,
      (product, value) => product.collectionSlugs.includes(value)
    );
    if (collectionOptions.length > 1) {
      facets.push({
        key: 'collection',
        label: 'Collection',
        choice: 'one',
        options: collectionOptions
      });
    }
  }

  const priceScope = scopeFor(products, state, { price: '' });
  const priceOptions = buildOptions(
    PRICE_BANDS.map((band) => ({ value: band.key, label: band.label })),
    priceScope,
    (value) => state.price === value,
    (product, value) => inPriceBand(product, value)
  );
  if (priceOptions.length > 1) {
    facets.push({ key: 'price', label: 'Price', choice: 'one', options: priceOptions });
  }

  /**
   * Attribute chips, grouped the way the tag catalog groups them and limited to
   * the tags that apply to the product types on screen. This is what keeps a
   * light-requirement filter away from a soap shopper.
   */
  const applicable: ProductTag[] = tagsForTypes(presentTypes);
  /**
   * Attributes the shop works out rather than stores. `on-sale` belongs here:
   * without it the rail had no way to filter by sale at all, and the only route
   * to it was a hand-written query string.
   */
  const derivedOnScreen = [
    'in-stock',
    'local-pickup',
    'ships',
    'new',
    'best-seller',
    'staff-pick',
    'on-sale'
  ];

  /**
   * Counted with only *this* group's own selections relaxed, not every tag.
   * Clearing all of them made the Light counts ignore a selected "Pet safe", so
   * the rail could offer "Bright light (1)" off a plant that is not pet safe and
   * ticking it emptied the grid — the exact dead end these counts exist to
   * prevent.
   */
  const tagFacet = (key: string, label: string, tags: Array<{ value: string; label: string }>) => {
    const own = new Set(tags.map((tag) => tag.value));
    const scope = scopeFor(products, state, {
      tags: state.tags.filter((tag) => !own.has(tag))
    });
    const options = buildOptions(
      tags,
      scope,
      (value) => state.tags.includes(value),
      (product, value) => product.tags.includes(value)
    );
    if (options.length) facets.push({ key, label, choice: 'many', options });
  };

  for (const group of groupTags(applicable)) {
    tagFacet(
      `tag:${group.key}`,
      group.label,
      group.tags.map((tag) => ({ value: tag.slug, label: tag.label }))
    );
  }

  tagFacet(
    'tag:buying',
    'Getting it home',
    derivedOnScreen.map((slug) => ({ value: slug, label: tagLabel(slug) }))
  );

  return facets;
}

/** Human wording for the "you have filtered by…" row and the clear button. */
export function activeFilterChips(
  state: ShopFilterState,
  collections: ReadonlyArray<{ slug: string; title: string }> = []
): Array<{ key: string; value: string; label: string }> {
  const chips: Array<{ key: string; value: string; label: string }> = [];
  if (state.category && state.category !== 'ALL') {
    chips.push({
      key: 'category',
      value: state.category,
      label: CATEGORY_GROUPS[state.category]?.label || productTypeLabel(state.category)
    });
  }
  if (state.collection) {
    const found = collections.find((collection) => collection.slug === state.collection);
    chips.push({
      key: 'collection',
      value: state.collection,
      label: found?.title || state.collection
    });
  }
  if (state.price) {
    const band = PRICE_BANDS.find((entry) => entry.key === state.price);
    if (band) chips.push({ key: 'price', value: state.price, label: band.label });
  }
  for (const tag of state.tags) {
    chips.push({ key: 'tag', value: tag, label: tagLabel(tag) });
  }
  return chips;
}

export function hasActiveFilters(state: ShopFilterState) {
  return (
    state.category !== 'ALL' ||
    Boolean(state.collection) ||
    Boolean(state.price) ||
    state.tags.length > 0 ||
    Boolean(state.search.trim())
  );
}

const SORTS = ['featured', 'new', 'best-selling', 'name', 'price-low', 'price-high'] as const;
export type ShopSort = (typeof SORTS)[number];

export function isShopSort(value: string): value is ShopSort {
  return (SORTS as readonly string[]).includes(value);
}

/** Every category value the shop can honour: a group key, or a bare type. */
const KNOWN_CATEGORIES = new Set([
  ...Object.keys(CATEGORY_GROUPS),
  ...Object.values(CATEGORY_GROUPS).flatMap((group) => group.types)
]);

/**
 * Reads the filter state out of a URL.
 *
 * Everything is validated, not merely read. An unknown tag, an unknown price
 * band, an unknown category or a category of pure whitespace is dropped rather
 * than carried — because a value the shop cannot honour still filters the grid
 * to nothing while showing a chip nobody can name, which is precisely the stale
 * link this is here to survive. Text is trimmed for the same reason: a
 * collection slug or search term with a trailing space is a different string to
 * every comparison that follows it.
 */
export function parseShopFilters(
  params: Record<string, string | string[] | undefined>,
  knownTags: readonly string[]
): ShopFilterState {
  const first = (value: string | string[] | undefined) =>
    ((Array.isArray(value) ? value[0] : value) || '').trim();
  const rawTags = params.tags;
  const tagList = (Array.isArray(rawTags) ? rawTags.join(',') : rawTags || '')
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => knownTags.includes(tag));

  /**
   * `?sale=true` is still honoured as an alias for the on-sale attribute, so
   * links written before sale became an ordinary filter keep working.
   */
  if (first(params.sale) === 'true' && knownTags.includes('on-sale')) tagList.push('on-sale');

  const sort = first(params.sort);
  const price = first(params.price);
  const category = first(params.category).toUpperCase();

  return {
    category: KNOWN_CATEGORIES.has(category) ? category : 'ALL',
    collection: first(params.collection),
    price: PRICE_BANDS.some((band) => band.key === price) ? price : '',
    tags: Array.from(new Set(tagList)),
    search: first(params.q),
    sort: isShopSort(sort) ? sort : 'featured'
  };
}

/** The query string a filter state should be bookmarkable at. */
export function shopFilterQuery(state: ShopFilterState): string {
  const params = new URLSearchParams();
  if (state.search.trim()) params.set('q', state.search.trim());
  if (state.category && state.category !== 'ALL') params.set('category', state.category);
  if (state.collection) params.set('collection', state.collection);
  if (state.price) params.set('price', state.price);
  if (state.tags.length) params.set('tags', [...state.tags].sort().join(','));
  if (state.sort && state.sort !== 'featured') params.set('sort', state.sort);
  return params.toString();
}
