/**
 * No `'use client'`. This component holds no state and no handlers — it lays out
 * cards — so the server can render it and only the cards themselves need to
 * hydrate. It is imported by the home page, the search page, the gift guides and
 * the care guides, all of which are server components, and the directive was
 * pulling this whole subtree into the browser bundle for nothing.
 */
import ProductCard, { type ProductCardProduct } from '@/components/ProductCard';

/**
 * A grid that stays composed at any length. `sparse` centres one or two cards
 * rather than stranding them in the first cell of a three-column track.
 */
export default function ProductGrid({
  products,
  /**
   * How many leading cards to load eagerly. The grid's first row is above the
   * fold and holds the page's LCP element on /shop and /collections, but every
   * card image defaulted to lazy — so the browser deferred discovering the one
   * image it should have fetched first. Two covers the phone layout's first row;
   * pass 0 for a grid that is never above the fold.
   */
  eagerCount = 2
}: {
  products: ProductCardProduct[];
  eagerCount?: number;
}) {
  if (!products.length) return null;
  return (
    <div className={`product-grid${products.length < 3 ? ' sparse' : ''}`}>
      {products.map((product, index) => (
        <ProductCard product={product} priority={index < eagerCount} key={product.id} />
      ))}
    </div>
  );
}
