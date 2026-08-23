'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import ProductCard, { type ProductCardProduct } from '@/components/ProductCard';
import { trackSearch } from '@/lib/analytics';
import { contactHref } from '@/lib/contact';
import { matchesAnySearchField } from '@/lib/search';
import { comparableAtCents, productSizes, sizePriceRange } from '@/lib/product-sizes';
import { categoryLabel, categoryTypes, discountPercent } from '@/lib/store';

type Product = ProductCardProduct & {
  featured: boolean;
  sortOrder: number;
  createdAt: string | Date;
};

/** A category as the shop offers it: one chip, one `?category=` value. */
export type ShopCategory = { slug: string; title: string };

type SortOption = 'featured' | 'new' | 'name' | 'price-low' | 'price-high';

const SORT_LABELS: Array<[SortOption, string]> = [
  ['featured', 'Featured first'],
  ['new', 'Just arrived'],
  ['name', 'Name A–Z'],
  ['price-low', 'Price: low to high'],
  ['price-high', 'Price: high to low']
];

function isSortOption(value: string): value is SortOption {
  return SORT_LABELS.some(([option]) => option === value);
}

/**
 * A card leads with what its sizes cost, so the sale chip and the price sorts
 * have to read the same figures. Resolved once per product rather than inside
 * a comparator, which would re-parse the size list on every comparison.
 */
function pricingFor(product: Product) {
  const sizes = productSizes(product.sizes, product.priceCents);
  return {
    ...sizePriceRange(sizes, product.priceCents),
    compareAtCents: comparableAtCents(sizes, product.priceCents, product.compareAtCents)
  };
}

/**
 * Whether a product belongs under a `?category=` value.
 *
 * There are two kinds of value and they are told apart by asking whether the
 * legacy groups recognise it. `BOTANICAL` and the bare product types are the
 * links the shop navigated by before it had a category table, and they still
 * have to work — somebody has one bookmarked. Everything else is a category
 * slug, which is what every link the site writes today uses.
 */
function inCategory(product: Product, category: string) {
  if (!category || category === 'ALL') return true;
  const legacyTypes = categoryTypes(category);
  if (legacyTypes.length) return legacyTypes.includes(product.type);
  return product.categorySlug === category;
}

export default function ShopClient({
  products,
  categories,
  initialCategory = 'ALL',
  initialSearch = '',
  initialSort = 'featured',
  initialOnSaleOnly = false
}: {
  products: Product[];
  categories: ShopCategory[];
  initialCategory?: string;
  initialSearch?: string;
  initialSort?: string;
  initialOnSaleOnly?: boolean;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [onSaleOnly, setOnSaleOnly] = useState(initialOnSaleOnly);
  const [category, setCategory] = useState(() => {
    // A filter that would empty the shelf is dropped rather than shown: a link
    // to a category nothing is in should land on the shop, not on "no results".
    const requested = initialCategory.trim();
    if (!requested || requested.toUpperCase() === 'ALL') return 'ALL';
    const key = categoryTypes(requested).length ? requested.toUpperCase() : requested;
    return products.some((product) => inCategory(product, key)) ? key : 'ALL';
  });
  const [sort, setSort] = useState<SortOption>(
    isSortOption(initialSort) ? initialSort : 'featured'
  );

  useEffect(() => {
    const term = initialSearch.trim();
    if (term) trackSearch(term);
  }, [initialSearch]);

  /**
   * Filtering happens entirely in this component, so a shopper who narrowed the
   * shop down to "Teas & Herbals, on sale, price low to high" had nothing to
   * send anyone, nothing to bookmark, and a Back button that left the page.
   * Mirroring the state into the query string fixes all three.
   *
   * `replaceState` rather than a router push: every keystroke would otherwise
   * become a history entry, and Back would walk back through the search letter
   * by letter. The debounce keeps typing from thrashing the URL.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const apply = (key: string, value: string, isDefault: boolean) => {
        if (isDefault) params.delete(key);
        else params.set(key, value);
      };

      apply('q', search.trim(), !search.trim());
      apply('category', category, category === 'ALL');
      apply('sort', sort, sort === 'featured');
      apply('sale', 'true', !onSaleOnly);

      const query = params.toString();
      const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
      if (next !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState(null, '', next);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [category, onSaleOnly, search, sort]);

  /**
   * A chip for every category that actually holds something, in the order Tammy
   * put them in. Categories with nothing in them are not offered: a chip that
   * leads to an empty shelf is worse than no chip at all.
   *
   * A legacy `?category=BOTANICAL` link has no chip of its own, so it is added
   * as one while it is the active filter — otherwise the shop would show a
   * filtered shelf with nothing on screen explaining why.
   */
  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      if (!product.categorySlug) continue;
      counts.set(product.categorySlug, (counts.get(product.categorySlug) || 0) + 1);
    }
    const offered = categories
      .filter((entry) => counts.has(entry.slug))
      .map((entry) => ({ key: entry.slug, label: entry.title }));
    const legacy =
      categoryTypes(category).length > 0 ? [{ key: category, label: categoryLabel(category) }] : [];
    return [{ key: 'ALL', label: 'Everything' }, ...legacy, ...offered];
  }, [categories, category, products]);

  const saleCount = useMemo(
    () =>
      products.filter(
        (product) => discountPercent(product.priceCents, pricingFor(product).compareAtCents) > 0
      ).length,
    [products]
  );

  const visibleProducts = useMemo(() => {
    const term = search.trim();
    const filtered = products
      .map((product) => ({ product, pricing: pricingFor(product) }))
      .filter(({ product, pricing }) => {
        const onSale =
          !onSaleOnly || discountPercent(product.priceCents, pricing.compareAtCents) > 0;
        const matchesSearch =
          !term ||
          matchesAnySearchField(
            // The category is searchable too, so "carnivorous" finds the
            // flytraps whether or not the word is in their descriptions.
            [product.name, product.description, product.shortDescription, product.categoryTitle],
            term
          );
        return inCategory(product, category) && onSale && matchesSearch;
      });

    return [...filtered]
      .sort((a, b) => {
        if (sort === 'name') return a.product.name.localeCompare(b.product.name);
        /**
         * Each direction reads the end of the range it is about. Sorting both by
         * the cheapest size would put a $20–$30 product above a $10–$50 one
         * under "high to low", with the more expensive piece second.
         */
        if (sort === 'price-low') return a.pricing.minCents - b.pricing.minCents;
        if (sort === 'price-high') return b.pricing.maxCents - a.pricing.maxCents;
        if (sort === 'new')
          return new Date(b.product.createdAt).getTime() - new Date(a.product.createdAt).getTime();
        return (
          Number(b.product.featured) - Number(a.product.featured) ||
          a.product.sortOrder - b.product.sortOrder ||
          a.product.name.localeCompare(b.product.name)
        );
      })
      .map(({ product }) => product);
  }, [category, onSaleOnly, products, search, sort]);

  const clearAll = () => {
    setSearch('');
    setCategory('ALL');
    setOnSaleOnly(false);
    setSort(isSortOption(initialSort) ? initialSort : 'featured');
  };

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
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search plants, teas and botanical goods"
              aria-label="Search products"
            />
          </div>
          <label className="sort-field">
            <span className="sr-only">Sort products</span>
            <select
              className="sort-select"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOption)}
            >
              {SORT_LABELS.map(([option, label]) => (
                <option value={option} key={option}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="filter-row" role="group" aria-label="Product categories">
          {chips.map(({ key, label }) => (
            <button
              className={`filter-chip${category === key ? ' active' : ''}`}
              type="button"
              onClick={() => setCategory(key)}
              aria-pressed={category === key}
              key={key}
            >
              {label}
            </button>
          ))}
          {saleCount > 0 && (
            <button
              className={`filter-chip sale${onSaleOnly ? ' active' : ''}`}
              type="button"
              onClick={() => setOnSaleOnly((value) => !value)}
              aria-pressed={onSaleOnly}
            >
              On sale ({saleCount})
            </button>
          )}
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
          <h3>No products matched that search.</h3>
          <p>Try another word, or ask whether something similar is coming back onto the bench.</p>
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
