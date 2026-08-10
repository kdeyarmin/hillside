'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import BrandedProductVisual from '@/components/BrandedProductVisual';
import { useCart } from '@/components/CartProvider';
import { discountPercent, formatMoney, productTypeLabel } from '@/lib/store';

export type ProductCardProduct = {
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
  averageRating?: number | null;
  reviewCount?: number;
};

function Stars({ rating, count }: { rating: number; count: number }) {
  const rounded = Math.round(rating * 2) / 2;
  return (
    <span className="rating-inline" aria-label={`Rated ${rating.toFixed(1)} out of 5 from ${count} reviews`}>
      <span className="rating-stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((step) => (
          <span className={step <= rounded ? 'on' : step - 0.5 === rounded ? 'half' : ''} key={step}>
            ★
          </span>
        ))}
      </span>
      <span aria-hidden="true">({count})</span>
    </span>
  );
}

export default function ProductCard({ product }: { product: ProductCardProduct }) {
  const { addItem, openCart } = useCart();
  const saving = discountPercent(product.priceCents, product.compareAtCents);
  const soldOut = product.inventory <= 0;

  return (
    <article className="product-card">
      <Link className="product-image-wrap" href={`/shop/${product.slug}`}>
        <span className="product-badges">
          {saving > 0 && <span className="product-badge sale">Save {saving}%</span>}
          {product.badge && <span className="product-badge">{product.badge}</span>}
        </span>
        <BrandedProductVisual
          slug={product.slug}
          name={product.name}
          type={product.type}
          imageUrl={product.imageUrl}
        />
      </Link>
      <div className="product-copy">
        <span className="pill">{productTypeLabel(product.type)}</span>
        <h3><Link href={`/shop/${product.slug}`}>{product.name}</Link></h3>
        {product.reviewCount ? (
          <Stars rating={product.averageRating || 0} count={product.reviewCount} />
        ) : null}
        <p>{product.shortDescription || product.description}</p>
        <p>
          <strong className="price">{formatMoney(product.priceCents)}</strong>
          {saving > 0 && product.compareAtCents && (
            <span className="compare-price">{formatMoney(product.compareAtCents)}</span>
          )}
        </p>
        <span className={`stock ${soldOut ? 'out' : product.inventory <= 3 ? 'low' : ''}`}>
          {soldOut ? 'Sold out' : product.inventory <= 3 ? `Only ${product.inventory} left` : 'In stock'}
        </span>
        <div className="product-actions">
          <Link className="text-link" href={`/shop/${product.slug}`}>
            {soldOut ? 'Get notified' : 'Details'}
          </Link>
          <button
            className="btn small"
            type="button"
            disabled={soldOut}
            onClick={() => {
              addItem({
                slug: product.slug,
                name: product.name,
                priceCents: product.priceCents,
                imageUrl: product.imageUrl,
                inventory: product.inventory,
                type: product.type
              });
              openCart();
            }}
          >
            <ShoppingBag size={16} /> Add to cart
          </button>
        </div>
      </div>
    </article>
  );
}
