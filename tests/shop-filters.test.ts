import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EMPTY_FILTERS,
  activeFilterChips,
  buildFacets,
  hasActiveFilters,
  matchesFilters,
  parseShopFilters,
  shopFilterQuery,
  type FilterableProduct,
  type ShopFilterState
} from '../lib/shop-filters.ts';
import { ALL_TAGS } from '../lib/product-tags.ts';

const KNOWN = ALL_TAGS.map((tag) => tag.slug);

const product = (
  id: string,
  type: string,
  minCents: number,
  tags: string[],
  collectionSlugs: string[] = [],
  maxCents = minCents
): FilterableProduct => ({ id, type, minCents, maxCents, tags, collectionSlugs });

const pothos = product(
  'pothos',
  'PLANT',
  1800,
  ['pet-safe', 'low-light', 'in-stock'],
  ['house-plants']
);
const flytrap = product(
  'flytrap',
  'PLANT',
  2400,
  ['bright-light', 'in-stock'],
  ['carnivorous-plants']
);
const soap = product('soap', 'SOAP', 900, ['handmade', 'giftable', 'in-stock'], ['botanicals']);
const catalog = [pothos, flytrap, soap];

const filters = (overrides: Partial<ShopFilterState> = {}): ShopFilterState => ({
  ...EMPTY_FILTERS,
  ...overrides
});

describe('matchesFilters', () => {
  it('requires every chosen attribute, not any of them', () => {
    assert.equal(matchesFilters(pothos, filters({ tags: ['pet-safe', 'low-light'] })), true);
    assert.equal(matchesFilters(pothos, filters({ tags: ['pet-safe', 'bright-light'] })), false);
  });

  it('reads the category as a merchandising group rather than one product type', () => {
    assert.equal(matchesFilters(soap, filters({ category: 'BOTANICAL' })), true);
    assert.equal(matchesFilters(soap, filters({ category: 'PLANT' })), false);
    assert.equal(matchesFilters(pothos, filters({ category: 'PLANT' })), true);
  });

  it('filters by collection', () => {
    assert.equal(matchesFilters(flytrap, filters({ collection: 'carnivorous-plants' })), true);
    assert.equal(matchesFilters(flytrap, filters({ collection: 'house-plants' })), false);
  });

  it('puts a product sold in several sizes in every band its sizes fall in', () => {
    const ranged = product('ranged', 'PLANT', 1200, ['in-stock'], [], 4000);
    assert.equal(matchesFilters(ranged, filters({ price: 'under-15' })), true);
    assert.equal(matchesFilters(ranged, filters({ price: '30-60' })), true);
    assert.equal(matchesFilters(ranged, filters({ price: '60-plus' })), false);
  });
});

describe('buildFacets', () => {
  /**
   * The live requirement: a soap customer does not need a light-requirement
   * filter. With only soap in scope, no light facet is offered at all.
   */
  it('offers no light filter to a shop showing only soap', () => {
    const facets = buildFacets([soap], filters());
    assert.equal(
      facets.some((facet) => facet.key === 'tag:light'),
      false
    );
    assert.equal(
      facets.some((facet) => facet.key === 'tag:making'),
      true
    );
  });

  it('offers the light filter as soon as a plant is on the shelf', () => {
    const facets = buildFacets(catalog, filters());
    const light = facets.find((facet) => facet.key === 'tag:light');
    assert.ok(light);
    assert.deepEqual(light.options.map((option) => option.value).sort(), [
      'bright-light',
      'low-light'
    ]);
  });

  it('drops an option nothing answers to', () => {
    const facets = buildFacets(catalog, filters());
    const care = facets.find((facet) => facet.key === 'tag:care');
    assert.ok(care);
    assert.equal(
      care.options.some((option) => option.value === 'drought-tolerant'),
      false
    );
  });

  it('counts an option against the other filters, not its own', () => {
    // Narrowed to plants: the light options count two plants between them and
    // stop counting the soap.
    const facets = buildFacets(catalog, filters({ category: 'PLANT' }));
    const light = facets.find((facet) => facet.key === 'tag:light');
    assert.deepEqual(
      light?.options.map((option) => option.count),
      [1, 1]
    );
  });

  it('keeps a selected filter visible even when it would count zero', () => {
    const facets = buildFacets([soap], filters({ tags: ['pet-safe'] }));
    const care = facets.find((facet) => facet.key === 'tag:care');
    assert.ok(care, 'the selected filter has to stay reachable to be undone');
    const petSafe = care.options.find((option) => option.value === 'pet-safe');
    assert.equal(petSafe?.count, 0);
    assert.equal(petSafe?.selected, true);
  });

  it('hides a single-option category or price facet as a dead choice', () => {
    const facets = buildFacets([soap], filters());
    assert.equal(
      facets.some((facet) => facet.key === 'category'),
      false
    );
    assert.equal(
      facets.some((facet) => facet.key === 'price'),
      false
    );
  });

  it('only offers a collection filter when collections are passed and differ', () => {
    const withCollections = buildFacets(catalog, filters(), [
      { slug: 'house-plants', title: 'House Plants' },
      { slug: 'botanicals', title: 'Botanicals' }
    ]);
    assert.equal(
      withCollections.some((facet) => facet.key === 'collection'),
      true
    );
    assert.equal(
      buildFacets(catalog, filters()).some((facet) => facet.key === 'collection'),
      false
    );
  });
});

describe('parseShopFilters and shopFilterQuery', () => {
  it('round-trips a filtered shop through the URL', () => {
    const state = filters({
      category: 'PLANT',
      collection: 'house-plants',
      price: '15-30',
      tags: ['pet-safe', 'low-light'],
      search: 'pothos',
      sort: 'price-low',
      onSaleOnly: true
    });
    const query = shopFilterQuery(state);
    const parsed = parseShopFilters(Object.fromEntries(new URLSearchParams(query)), KNOWN);
    assert.deepEqual(
      { ...parsed, tags: parsed.tags.sort() },
      { ...state, tags: [...state.tags].sort() }
    );
  });

  it('leaves defaults out of the URL entirely', () => {
    assert.equal(shopFilterQuery(EMPTY_FILTERS), '');
  });

  it('drops a tag or price band a stale link is still carrying', () => {
    const parsed = parseShopFilters(
      { tags: 'pet-safe,retired-attribute', price: 'made-up', sort: 'sideways' },
      KNOWN
    );
    assert.deepEqual(parsed.tags, ['pet-safe']);
    assert.equal(parsed.price, '');
    assert.equal(parsed.sort, 'featured');
  });

  it('reads a repeated query parameter without crashing the page', () => {
    const parsed = parseShopFilters({ q: ['pothos', 'monstera'], category: ['plant'] }, KNOWN);
    assert.equal(parsed.search, 'pothos');
    assert.equal(parsed.category, 'PLANT');
  });
});

describe('activeFilterChips and hasActiveFilters', () => {
  it('names every applied filter so each can be removed on its own', () => {
    const chips = activeFilterChips(
      filters({ category: 'PLANT', price: '15-30', tags: ['pet-safe'], onSaleOnly: true }),
      []
    );
    assert.deepEqual(
      chips.map((chip) => chip.label),
      ['Plants', '$15 to $30', 'On sale', 'Pet safe']
    );
  });

  it('knows when nothing is applied', () => {
    assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
    assert.equal(hasActiveFilters(filters({ search: 'pothos' })), true);
    // Sort is not a filter: it changes the order, never what is shown.
    assert.equal(hasActiveFilters(filters({ sort: 'price-low' })), false);
  });
});
