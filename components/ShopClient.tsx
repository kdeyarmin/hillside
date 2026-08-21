'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import ProductCard, { type ProductCardProduct } from '@/components/ProductCard';
import { trackSearch } from '@/lib/analytics';
import { contactHref } from '@/lib/contact';
import { matchesAnySearchField } from '@/lib/search';
import { CATEGORY_GROUPS, categoryTypes, discountPercent, productTypeLabel } from '@/lib/store';

type Product = ProductCardProduct & {
  featured: boolean;
  sortOrder: number;
  createdAt: string | Date;
};

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

export default function ShopClient({
  products,
  initialCategory = 'ALL',
  initialSearch = '',
  initialSort = 'featured',
  initialOnSaleOnly = false
}: {
  products: Product[];
  initialCategory?: string;
  initialSearch?: string;
  initialSort?: string;
  initialOnSaleOnly?: boolean;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [onSaleOnly, setOnSaleOnly] = useState(initialOnSaleOnly);
  const [category, setCategory] = useState(() => {
    const requested = initialCategory.toUpperCase();
    if (requested === 'ALL') return 'ALL';
    const types = categoryTypes(requested);
    return types.some((type) => products.some((product) => product.type === type))
      ? requested
      : 'ALL';
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
   * Category chips are merchandising groups rather than raw enum values, so
   * "Botanicals" covers soaps, lotions and anything else handmade instead of
   * hiding two thirds of the shelf behind a single ProductType.
   */
  const categories = useMemo(() => {
    const present = new Set(products.map((product) => product.type));
    const groups = Object.entries(CATEGORY_GROUPS)
      .filter(([, group]) => group.types.some((type) => present.has(type)))
      .map(([key, group]) => ({ key, label: group.label }));
    const grouped = new Set(Object.values(CATEGORY_GROUPS).flatMap((group) => group.types));
    const ungrouped = Array.from(present)
      .filter((type) => !grouped.has(type))
      .map((type) => ({ key: type, label: productTypeLabel(type) }));
    return [{ key: 'ALL', label: 'Everything' }, ...groups, ...ungrouped];
  }, [products]);

  const saleCount = useMemo(
    () =>
      products.filter((product) => discountPercent(product.priceCents, product.compareAtCents) > 0)
        .length,
    [products]
  );

  const visibleProducts = useMemo(() => {
    const term = search.trim();
    const allowedTypes = categoryTypes(category);
    const filtered = products.filter((product) => {
      const inCategory = !allowedTypes.length || allowedTypes.includes(product.type);
      const onSale = !onSaleOnly || discountPercent(product.priceCents, product.compareAtCents) > 0;
      const matchesSearch =
        !term ||
        matchesAnySearchField([product.name, product.description, product.shortDescription], term);
      return inCategory && onSale && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'price-low') return a.priceCents - b.priceCents;
      if (sort === 'price-high') return b.priceCents - a.priceCents;
      if (sort === 'new') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return (
        Number(b.featured) - Number(a.featured) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name)
      );
    });
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
          {categories.map(({ key, label }) => (
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
