'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import ProductCard, { type ProductCardProduct } from '@/components/ProductCard';
import { trackSearch } from '@/lib/analytics';
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
  initialSort = 'featured'
}: {
  products: Product[];
  initialCategory?: string;
  initialSearch?: string;
  initialSort?: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [category, setCategory] = useState(() => {
    const requested = initialCategory.toUpperCase();
    if (requested === 'ALL') return 'ALL';
    const types = categoryTypes(requested);
    return types.some((type) => products.some((product) => product.type === type)) ? requested : 'ALL';
  });
  const [sort, setSort] = useState<SortOption>(isSortOption(initialSort) ? initialSort : 'featured');

  useEffect(() => {
    const term = initialSearch.trim();
    if (term) trackSearch(term);
  }, [initialSearch]);

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
    () => products.filter((product) => discountPercent(product.priceCents, product.compareAtCents) > 0).length,
    [products]
  );

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const allowedTypes = categoryTypes(category);
    const filtered = products.filter((product) => {
      const inCategory = !allowedTypes.length || allowedTypes.includes(product.type);
      const onSale = !onSaleOnly || discountPercent(product.priceCents, product.compareAtCents) > 0;
      const matchesSearch =
        !term ||
        product.name.toLowerCase().includes(term) ||
        product.description.toLowerCase().includes(term) ||
        (product.shortDescription || '').toLowerCase().includes(term);
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
  };

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
                <option value={option} key={option}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="filter-row" aria-label="Product categories">
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
        <b>{visibleProducts.length} {visibleProducts.length === 1 ? 'product' : 'products'}</b>
        <span className="muted">Live inventory from our owner dashboard</span>
      </div>

      {visibleProducts.length === 0 ? (
        <div className="empty-state">
          <Search size={38} />
          <h3>No products matched that search.</h3>
          <p>Try another word or choose a different collection.</p>
          <button className="btn" type="button" onClick={clearAll}>Show everything</button>
        </div>
      ) : (
        <div className={`product-grid${visibleProducts.length < 3 ? ' sparse' : ''}`}>
          {visibleProducts.map((product) => (
            <ProductCard product={product} key={product.id} />
          ))}
        </div>
      )}
    </>
  );
}
