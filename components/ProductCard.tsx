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
import { merchandisingBadges } from '@/lib/merchandising';
import { cardTraitTags, tagLabel } from '@/lib/product-tags';
import { discountPercent, formatMoney, productTypeLabel } from '@/lib/store';

export type ProductCardProduct = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string;
  type: string;
  /** The product's category, when it has one — the pill a card leads with. */
  categorySlug?: string | null;
  categoryTitle?: string | null;
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
  staffPick?: boolean | null;
  /**
   * The attributes Tammy ticked on this product. Read for the claims below, and
   * only the ones this card is allowed to state — see `cardTraitTags`.
   */
  tags?: readonly string[] | null;
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
  /**
   * Which sizes can actually be bought right now. A card that lists three pot
   * sizes on a plant where only the 4" is left sends the shopper to a page that
   * disagrees with it.
   */
  const inStockSizes = sizes.filter((size) => sizeAvailable(size, product.inventory) > 0);
  const lowStock = !soldOut && product.inventory <= LOW_STOCK_AT;

  /**
   * Quiet claims about the product itself, kept below the copy so the badges on
   * the photograph stay about urgency. The first two are attributes Tammy ticked
   * — a card states them, it does not work them out. Local pickup only appears
   * when it is the *only* way home: almost everything here can be picked up, so
   * saying so on every card would say nothing at all, while "does not ship" is
   * news.
   */
  const traits = [
    ...cardTraitTags(product.tags, product.type).map((slug) => ({
      key: slug,
      text: tagLabel(slug)
    })),
    product.pickup && product.ships === false && { key: 'pickup', text: 'Local pickup only' }
  ].filter((trait): trait is { key: string; text: string } => Boolean(trait));

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
        {/* The category is what a shopper recognises — "Carnivorous Plants",
            not "Plant" — so the broad type is only the fallback for a product
            that has not been given one. */}
        <span className="pill">{product.categoryTitle || productTypeLabel(product.type)}</span>
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
