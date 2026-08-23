'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import BrandedProductVisual from '@/components/BrandedProductVisual';
import { useCart } from '@/components/CartProvider';
import { LOW_STOCK_AT } from '@/lib/inventory';
import {
  comparableAtCents,
  formatSizePriceRange,
  productSizes,
  sizeAvailable,
  sizeFieldLabel
} from '@/lib/product-sizes';
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
  /** Raw `Product.sizes`; a card needs the labels and whether each has stock. */
  sizes?: unknown;
  sizeLabel?: string | null;
  averageRating?: number | null;
  reviewCount?: number;
  /** Three-state: null is "nobody has said", and makes no claim either way. */
  petSafe?: boolean | null;
  beginnerFriendly?: boolean;
  /** Both decided server-side by `withCardFacts` — see the note there. */
  bestSeller?: boolean;
  isNew?: boolean;
};

/**
 * How many badges may sit on one photograph.
 *
 * A card carrying "Save 20%", "Our pick", "Best seller", "New" and a low-stock
 * chip at once is a card nobody reads. Three is the most that stays scannable,
 * and the order below is the order they earn their place in: a price change and
 * the owner's own merchandising outrank anything the shop worked out by itself.
 */
const MAX_CARD_BADGES = 3;

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
  /**
   * Which sizes can actually be bought right now. A card that lists three pot
   * sizes on a plant where only the 4" is left sends the shopper to a page that
   * disagrees with it.
   */
  const inStockSizes = sizes.filter((size) => sizeAvailable(size, product.inventory) > 0);
  const lowStock = !soldOut && product.inventory <= LOW_STOCK_AT;

  const badges = [
    saving > 0 && { key: 'sale', tone: 'sale', text: `Save ${saving}%` },
    product.badge && { key: 'own', tone: '', text: product.badge },
    product.bestSeller && { key: 'best', tone: 'best', text: 'Best seller' },
    product.isNew && { key: 'new', tone: 'new', text: 'New' }
  ]
    .filter((badge): badge is { key: string; tone: string; text: string } => Boolean(badge))
    .slice(0, MAX_CARD_BADGES);

  /**
   * Quiet claims about the product itself, kept out of the photograph so the
   * badges above stay about urgency. Local pickup only appears when it is the
   * *only* way home — almost everything here can be picked up, so saying so on
   * every card would say nothing at all, while "does not ship" is news.
   */
  const traits = [
    product.petSafe === true && { key: 'pet', text: 'Pet safe' },
    product.beginnerFriendly && { key: 'beginner', text: 'Beginner friendly' },
    product.pickup && product.ships === false && { key: 'pickup', text: 'Local pickup only' }
  ].filter((trait): trait is { key: string; text: string } => Boolean(trait));

  return (
    <article className="product-card">
      <Link className="product-image-wrap" href={`/shop/${product.slug}`}>
        {badges.length > 0 && (
          <span className="product-badges">
            {badges.map((badge) => (
              <span className={`product-badge ${badge.tone}`.trim()} key={badge.key}>
                {badge.text}
              </span>
            ))}
          </span>
        )}
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
        <span className={`stock ${soldOut ? 'out' : lowStock ? 'low' : ''}`}>
          {soldOut ? 'Sold out' : lowStock ? `Only ${product.inventory} left` : 'In stock'}
        </span>
        {needsSize && inStockSizes.length > 0 && (
          <span className="product-variants">
            {inStockSizes.length === sizes.length
              ? `${sizes.length} ${sizeWord}s: `
              : `${inStockSizes.length} of ${sizes.length} ${sizeWord}s left: `}
            {inStockSizes
              .slice(0, 3)
              .map((size) => size.label)
              .join(' · ')}
            {inStockSizes.length > 3 && ` +${inStockSizes.length - 3}`}
          </span>
        )}
        {traits.length > 0 && (
          <span className="product-traits">
            {traits.map((trait) => (
              <span className="product-trait" key={trait.key}>
                {trait.text}
              </span>
            ))}
          </span>
        )}
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
