'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search, ShoppingBag } from 'lucide-react';
import BrandedProductVisual from '@/components/BrandedProductVisual';
import { useCart } from '@/components/CartProvider';
import { formatMoney, productTypeLabel } from '@/lib/store';

type Product = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string;
  type: string;
  priceCents: number;
  compareAtCents: number | null;
  inventory: number;
  imageUrl: string | null;
  badge: string | null;
  featured: boolean;
  sortOrder: number;
};

type SortOption = 'featured' | 'name' | 'price-low' | 'price-high';

export default function ShopClient({
  products,
  initialCategory = 'ALL'
}: {
  products: Product[];
  initialCategory?: string;
}) {
  const { addItem, openCart } = useCart();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(
    initialCategory === 'ALL' || products.some((product) => product.type === initialCategory)
      ? initialCategory
      : 'ALL'
  );
  const [sort, setSort] = useState<SortOption>('featured');

  const categories = useMemo(
    () => ['ALL', ...Array.from(new Set(products.map((product) => product.type)))],
    [products]
  );

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = products.filter((product) => {
      const inCategory = category === 'ALL' || product.type === category;
      const matchesSearch =
        !term ||
        product.name.toLowerCase().includes(term) ||
        product.description.toLowerCase().includes(term) ||
        (product.shortDescription || '').toLowerCase().includes(term);
      return inCategory && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'price-low') return a.priceCents - b.priceCents;
      if (sort === 'price-high') return b.priceCents - a.priceCents;
      return Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
    });
  }, [category, products, search, sort]);

  function add(product: Product) {
    addItem({
      slug: product.slug,
      name: product.name,
      priceCents: product.priceCents,
      imageUrl: product.imageUrl,
      inventory: product.inventory,
      type: product.type
    });
    openCart();
  }

  return (
    <>
      <div className="shop-controls">
        <div className="shop-control-top">
          <div className="search-wrap">
            <Search size={18} />
            <input
              className="search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search plants, teas and botanical goods"
              aria-label="Search products"
            />
          </div>
          <select
            className="search-input sort-select"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOption)}
            aria-label="Sort products"
          >
            <option value="featured">Featured first</option>
            <option value="name">Name A–Z</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
          </select>
        </div>
        <div className="filter-row" aria-label="Product categories">
          {categories.map((type) => (
            <button
              className={`filter-chip${category === type ? ' active' : ''}`}
              type="button"
              onClick={() => setCategory(type)}
              key={type}
            >
              {type === 'ALL' ? 'Everything' : productTypeLabel(type)}
            </button>
          ))}
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
          <button className="btn" type="button" onClick={() => { setSearch(''); setCategory('ALL'); }}>
            Show everything
          </button>
        </div>
      ) : (
        <div className="product-grid">
          {visibleProducts.map((product) => {
            const stockClass = product.inventory === 0 ? 'out' : product.inventory <= 3 ? 'low' : '';
            return (
              <article className="product-card" key={product.id}>
                <Link className="product-image-wrap" href={`/shop/${product.slug}`}>
                  {product.badge && <span className="product-badge">{product.badge}</span>}
                  <BrandedProductVisual
                    slug={product.slug}
                    name={product.name}
                    type={product.type}
                    imageUrl={product.imageUrl}
                  />
                </Link>
                <div className="product-copy">
                  <span className="pill">{productTypeLabel(product.type)}</span>
                  <h2><Link href={`/shop/${product.slug}`}>{product.name}</Link></h2>
                  <p>{product.shortDescription || product.description}</p>
                  <p>
                    <strong className="price">{formatMoney(product.priceCents)}</strong>
                    {product.compareAtCents && product.compareAtCents > product.priceCents && (
                      <span className="compare-price">{formatMoney(product.compareAtCents)}</span>
                    )}
                  </p>
                  <span className={`stock ${stockClass}`}>
                    {product.inventory === 0
                      ? 'Sold out'
                      : product.inventory <= 3
                        ? `Only ${product.inventory} left`
                        : 'In stock'}
                  </span>
                  <div className="product-actions">
                    <Link className="text-link" href={`/shop/${product.slug}`}>Details</Link>
                    <button
                      className="btn small"
                      type="button"
                      disabled={product.inventory <= 0}
                      onClick={() => add(product)}
                    >
                      <ShoppingBag size={16} /> Add to cart
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
