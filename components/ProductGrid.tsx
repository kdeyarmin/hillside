'use client';

import ProductCard, { type ProductCardProduct } from '@/components/ProductCard';

/**
 * A grid that stays composed at any length. `sparse` centres one or two cards
 * rather than stranding them in the first cell of a three-column track.
 */
export default function ProductGrid({ products }: { products: ProductCardProduct[] }) {
  if (!products.length) return null;
  return (
    <div className={`product-grid${products.length < 3 ? ' sparse' : ''}`}>
      {products.map((product) => (
        <ProductCard product={product} key={product.id} />
      ))}
    </div>
  );
}
