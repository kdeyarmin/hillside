'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import ProductCard, { type ProductCardProduct } from '@/components/ProductCard';
import { trackSearch } from '@/lib/analytics';
import { contactHref } from '@/lib/contact';
import { productSearchFields } from '@/lib/catalog-search';
import { matchesAnySearchFieldFuzzy } from '@/lib/search';
import { comparableAtCents, productSizes, sizePriceRange } from '@/lib/product-sizes';
import {
  activeFilterChips,
  buildFacets,
  hasActiveFilters,
  isShopSort,
  matchesFilters,
  shopFilterQuery,
  type FilterableProduct,
  type ShopFilterState
} from '@/lib/shop-filters';

export type ShopProduct = ProductCardProduct & {
  featured: boolean;
  sortOrder: number;
  createdAt: string | Date;
  botanical?: string | null;
  searchTerms?: string | null;
  /** Every attribute, assigned and derived, resolved on the server. */
  tags: string[];
  collections?: Array<{
    slug: string;
    title: string;
    tagline?: string | null;
    keywords?: string[];
  }>;
  unitsSold?: number;
};

type SortOption = 'featured' | 'new' | 'best-selling' | 'name' | 'price-low' | 'price-high';

const SORT_LABELS: Array<[SortOption, string]> = [
  ['featured', 'Featured first'],
  ['best-selling', 'Best selling'],
  ['new', 'Just arrived'],
  ['name', 'Name A–Z'],
  ['price-low', 'Price: low to high'],
  ['price-high', 'Price: high to low']
];

/**
 * A card leads with what its sizes cost, so the sale chip, the price sorts and
 * the price filter have to read the same figures. Resolved once per product
 * rather than inside a comparator, which would re-parse the size list on every
 * comparison.
 */
function pricingFor(product: ShopProduct) {
  const sizes = productSizes(product.sizes, product.priceCents);
  return {
    ...sizePriceRange(sizes, product.priceCents),
    compareAtCents: comparableAtCents(sizes, product.priceCents, product.compareAtCents)
  };
}

export default function ShopClient({
  products,
  collections = [],
  initial
}: {
  products: ShopProduct[];
  collections?: Array<{ slug: string; title: string }>;
  initial: ShopFilterState;
}) {
  const [state, setState] = useState<ShopFilterState>(initial);
  const [railOpen, setRailOpen] = useState(false);

  useEffect(() => {
    const term = initial.search.trim();
    if (term) trackSearch(term);
  }, [initial.search]);

  /**
   * Filtering happens entirely in this component, so a shopper who narrowed the
   * shop down to "pet safe, low light, under $30" had nothing to send anyone,
   * nothing to bookmark, and a Back button that left the page. Mirroring the
   * state into the query string fixes all three.
   *
   * `replaceState` rather than a router push: every keystroke would otherwise
   * become a history entry, and Back would walk back through the search letter
   * by letter. The debounce keeps typing from thrashing the URL.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = shopFilterQuery(state);
      const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
      if (next !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState(null, '', next);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [state]);

  /** The filterable shape, computed once — facets and the grid both read it. */
  const filterable = useMemo(() => {
    const map = new Map<string, FilterableProduct>();
    for (const product of products) {
      const pricing = pricingFor(product);
      map.set(product.id, {
        id: product.id,
        type: product.type,
        minCents: pricing.minCents,
        maxCents: pricing.maxCents,
        tags: product.tags,
        collectionSlugs: (product.collections || []).map((collection) => collection.slug)
      });
    }
    return map;
  }, [products]);

  const facets = useMemo(
    () => buildFacets([...filterable.values()], state, collections),
    [collections, filterable, state]
  );

  const visibleProducts = useMemo(() => {
    const term = state.search.trim();
    const matched = products.filter((product) => {
      const shape = filterable.get(product.id);
      if (!shape || !matchesFilters(shape, state)) return false;
      if (!term) return true;
      const { primary, secondary } = productSearchFields(product, product.tags);
      return matchesAnySearchFieldFuzzy([...primary, ...secondary], term);
    });

    return [...matched].sort((a, b) => {
      const priceA = pricingFor(a);
      const priceB = pricingFor(b);
      if (state.sort === 'name') return a.name.localeCompare(b.name);
      /**
       * Each direction reads the end of the range it is about. Sorting both by
       * the cheapest size would put a $20–$30 product above a $10–$50 one under
       * "high to low", with the more expensive piece second.
       */
      if (state.sort === 'price-low') return priceA.minCents - priceB.minCents;
      if (state.sort === 'price-high') return priceB.maxCents - priceA.maxCents;
      if (state.sort === 'new')
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (state.sort === 'best-selling')
        return (b.unitsSold || 0) - (a.unitsSold || 0) || a.name.localeCompare(b.name);
      return (
        Number(b.featured) - Number(a.featured) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name)
      );
    });
  }, [filterable, products, state]);

  const chips = activeFilterChips(state, collections);
  const filtered = hasActiveFilters(state);

  const setValue = (key: keyof ShopFilterState, value: string) =>
    setState((current) => ({ ...current, [key]: value }));

  const toggleTag = (tag: string) =>
    setState((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((entry) => entry !== tag)
        : [...current.tags, tag]
    }));

  const removeChip = (key: string, value: string) =>
    setState((current) => {
      if (key === 'category') return { ...current, category: 'ALL' };
      if (key === 'collection') return { ...current, collection: '' };
      if (key === 'price') return { ...current, price: '' };
      if (key === 'sale') return { ...current, onSaleOnly: false };
      return { ...current, tags: current.tags.filter((entry) => entry !== value) };
    });

  const clearAll = () =>
    setState((current) => ({
      category: 'ALL',
      collection: '',
      price: '',
      tags: [],
      search: '',
      onSaleOnly: false,
      sort: current.sort
    }));

  if (products.length === 0) {
    return (
      <div className="empty-state wide">
        <Search size={38} aria-hidden="true" />
        <h3>Nothing is on the bench right now.</h3>
        <p>
          We only list plants and goods that are ready to go home. Ask about a custom arrangement or
          a local pickup, or browse the care library while the next batch is potted.
        </p>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <Link className="btn" href={contactHref({ subject: 'Custom planter arrangement' })}>
            Ask about a custom arrangement
          </Link>
          <Link className="btn outline" href="/care">
            Plant care library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="shop-controls">
        <div className="shop-control-top">
          <div className="search-wrap">
            <Search size={18} aria-hidden="true" />
            <input
              className="search-input"
              type="search"
              value={state.search}
              onChange={(event) => setValue('search', event.target.value)}
              placeholder="Try pothos, pet safe, low light, terrarium"
              aria-label="Search products"
            />
          </div>
          <button
            className={`btn outline small shop-filter-toggle${railOpen ? ' active' : ''}`}
            type="button"
            onClick={() => setRailOpen((open) => !open)}
            aria-expanded={railOpen}
            aria-controls="shop-filter-rail"
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            {railOpen ? 'Hide filters' : 'Filters'}
            {chips.length > 0 && <span className="filter-count">{chips.length}</span>}
          </button>
          <label className="sort-field">
            <span className="sr-only">Sort products</span>
            <select
              className="sort-select"
              value={state.sort}
              onChange={(event) =>
                setValue('sort', isShopSort(event.target.value) ? event.target.value : 'featured')
              }
            >
              {SORT_LABELS.map(([option, label]) => (
                <option value={option} key={option}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {chips.length > 0 && (
          <div className="active-filters" aria-label="Filters you have applied">
            {chips.map((chip) => (
              <button
                className="filter-chip active"
                type="button"
                key={`${chip.key}-${chip.value}`}
                onClick={() => removeChip(chip.key, chip.value)}
              >
                {chip.label}
                <X size={13} aria-hidden="true" />
                <span className="sr-only">Remove this filter</span>
              </button>
            ))}
            <button className="text-link" type="button" onClick={clearAll}>
              Clear all
            </button>
          </div>
        )}

        {/* Every facet here is one something on the shelf answers to. A shop
            showing only soap never renders a light filter, because the tag
            catalog says light does not apply to soap and the counts would be
            zero either way. */}
        <div className={`shop-filter-rail${railOpen ? ' open' : ''}`} id="shop-filter-rail">
          {facets.map((facet) => (
            <div className="filter-group" key={facet.key}>
              {facet.choice === 'one' ? (
                <label className="filter-select-field">
                  <span>{facet.label}</span>
                  <select
                    className="sort-select"
                    value={
                      facet.key === 'category'
                        ? state.category === 'ALL'
                          ? ''
                          : state.category
                        : facet.key === 'collection'
                          ? state.collection
                          : state.price
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      if (facet.key === 'category') setValue('category', value || 'ALL');
                      else if (facet.key === 'collection') setValue('collection', value);
                      else setValue('price', value);
                    }}
                  >
                    <option value="">
                      {facet.key === 'category' ? 'Everything' : `Any ${facet.label.toLowerCase()}`}
                    </option>
                    {facet.options.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label} ({option.count})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <fieldset className="filter-fieldset">
                  <legend>{facet.label}</legend>
                  <div className="filter-row">
                    {facet.options.map((option) => (
                      <button
                        className={`filter-chip${option.selected ? ' active' : ''}`}
                        type="button"
                        key={option.value}
                        aria-pressed={option.selected}
                        onClick={() => toggleTag(option.value)}
                      >
                        {option.label} <span className="filter-chip-count">{option.count}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="toolbar">
        <b>
          {visibleProducts.length} {visibleProducts.length === 1 ? 'product' : 'products'}
        </b>
        <span className="muted">Stock counts update as each piece is potted and sold</span>
      </div>

      {visibleProducts.length === 0 ? (
        <div className="empty-state">
          <Search size={38} aria-hidden="true" />
          <h3>{filtered ? 'Nothing matched those filters.' : 'No products matched.'}</h3>
          <p>
            Try removing a filter, or ask whether something similar is coming back on the bench.
          </p>
          <div className="actions" style={{ justifyContent: 'center' }}>
            <button className="btn" type="button" onClick={clearAll}>
              Show everything
            </button>
            <Link
              className="btn outline"
              href={contactHref({ subject: 'Availability or restock' })}
            >
              Ask about availability
            </Link>
          </div>
        </div>
      ) : (
        <div className={`product-grid${visibleProducts.length < 3 ? ' sparse' : ''}`}>
          {visibleProducts.map((product, index) => (
            // The shop's first row is the page's LCP; everything below it stays lazy.
            <ProductCard product={product} priority={index < 2} key={product.id} />
          ))}
        </div>
      )}
    </>
  );
}
