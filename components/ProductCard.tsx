'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import BrandedProductVisual from '@/components/BrandedProductVisual';
import { useCart } from '@/components/CartProvider';
import {
  comparableAtCents,
  formatSizePriceRange,
  productSizes,
  sizeFieldLabel
} from '@/lib/product-sizes';
import { merchandisingBadges } from '@/lib/merchandising';
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
  ships?: boolean;
  pickup?: boolean;
  /** Raw `Product.sizes`; a card only needs to know whether a choice is due. */
  sizes?: unknown;
  sizeLabel?: string | null;
  averageRating?: number | null;
  reviewCount?: number;
  staffPick?: boolean | null;
  /**
   * The automatic labels, worked out on the server from order history and the
   * product's dates. Optional because plenty of grids (the cart's suggestions,
   * an archived product's page) have no reason to pay for them.
   */
  flags?: {
    isNew?: boolean;
    isBestSeller?: boolean;
    isInSeason?: boolean;
    isOnSale?: boolean;
  } | null;
};

function Stars({ rating, count }: { rating: number; count: number }) {
  const rounded = Math.round(rating * 2) / 2;
  return (
    /**
     * The accessible name is carried by visually hidden text, not by `aria-label`
     * on the wrapper. That wrapper is a bare `<span>` — implicit role `generic` —
     * and `aria-label` is not exposed on generic elements, so with both children
     * `aria-hidden` every star rating on the site announced as nothing at all.
     */
    <span className="rating-inline">
      <span className="sr-only">
        Rated {rating.toFixed(1)} out of 5 from {count} {count === 1 ? 'review' : 'reviews'}
      </span>
      <span className="rating-stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            className={step <= rounded ? 'on' : step - 0.5 === rounded ? 'half' : ''}
            key={step}
          >
            ★
          </span>
        ))}
      </span>
      <span aria-hidden="true">({count})</span>
    </span>
  );
}

export default function ProductCard({
  product,
  priority = false
}: {
  product: ProductCardProduct;
  priority?: boolean;
}) {
  const { addItem, openCart } = useCart();
  const soldOut = product.inventory <= 0;
  const sizes = productSizes(product.sizes, product.priceCents);
  const compareAt = comparableAtCents(sizes, product.priceCents, product.compareAtCents);
  const saving = discountPercent(product.priceCents, compareAt);
  /**
   * A card cannot take the size choice — there is no room for a dropdown beside
   * every photograph, and picking one for the shopper would put the wrong pot in
   * the basket. So a sized product sends them to its page to choose.
   */
  const needsSize = sizes.length > 0;
  const sizeWord = sizeFieldLabel(product.sizeLabel).toLowerCase();

  return (
    <article className="product-card">
      <Link className="product-image-wrap" href={`/shop/${product.slug}`}>
        <span className="product-badges">
          {merchandisingBadges(product, {
            savingPercent: saving,
            isBestSeller: product.flags?.isBestSeller,
            isNew: product.flags?.isNew,
            isInSeason: product.flags?.isInSeason
          }).map((badge) => (
            <span className={`product-badge ${badge.tone}`} key={`${badge.tone}-${badge.label}`}>
              {badge.label}
            </span>
          ))}
        </span>
        <BrandedProductVisual
          slug={product.slug}
          name={product.name}
          type={product.type}
          imageUrl={product.imageUrl}
          loading={priority ? 'eager' : 'lazy'}
        />
      </Link>
      <div className="product-copy">
        <span className="pill">{productTypeLabel(product.type)}</span>
        <h3>
          <Link href={`/shop/${product.slug}`}>{product.name}</Link>
        </h3>
        {product.reviewCount ? (
          <Stars rating={product.averageRating || 0} count={product.reviewCount} />
        ) : null}
        <p>{product.shortDescription || product.description}</p>
        <p>
          <strong className="price">{formatSizePriceRange(sizes, product.priceCents)}</strong>
          {saving > 0 && compareAt && (
            <span className="compare-price">
              <span className="sr-only">Was </span>
              {formatMoney(compareAt)}
            </span>
          )}
        </p>
        <span className={`stock ${soldOut ? 'out' : product.inventory <= 3 ? 'low' : ''}`}>
          {soldOut
            ? 'Sold out'
            : product.inventory <= 3
              ? `Only ${product.inventory} left`
              : 'In stock'}
        </span>
        <div className="product-actions">
          <Link className="text-link" href={`/shop/${product.slug}`}>
            {soldOut ? 'Get notified' : 'Details'}
          </Link>
          {needsSize && !soldOut ? (
            <Link className="btn small" href={`/shop/${product.slug}`}>
              <ShoppingBag size={16} /> Choose {sizeWord}
            </Link>
          ) : (
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
                  type: product.type,
                  ships: product.ships,
                  pickup: product.pickup
                });
                openCart();
              }}
            >
              <ShoppingBag size={16} /> Add to cart
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
