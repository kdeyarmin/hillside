'use client';

import Link from 'next/link';
import { Truck } from 'lucide-react';
import ResilientImage from '@/components/ResilientImage';
import { useCart } from '@/components/CartProvider';
import { useBasketSuggestions } from '@/components/useBasketSuggestions';
import { unlocksFreeShippingFor, type FreeShippingProgress } from '@/lib/free-shipping';
import { formatSizePriceRange, productSizes, sizeFieldLabel } from '@/lib/product-sizes';
import { FALLBACK_PRODUCT_IMAGE, formatMoney } from '@/lib/store';

/** How many the cart page has room for; the drawer shows two. */
const CART_PAGE_SUGGESTIONS = 3;

/**
 * "Goes well with" on the cart page, where until now there was nothing.
 *
 * The drawer has offered two suggestions for a while; the cart page — the one
 * place a shopper stops to think before paying — offered none, and it is also
 * the page with the free-shipping meter. So this strip does the arithmetic the
 * shopper would otherwise do: anything priced at or above what the basket is
 * short by is tagged as the thing that makes shipping free, and the heading
 * says so when at least one of them qualifies.
 */
export default function CartSuggestions({ progress }: { progress: FreeShippingProgress | null }) {
  const { addItem } = useCart();
  const suggestions = useBasketSuggestions(CART_PAGE_SUGGESTIONS);

  if (!suggestions.length) return null;

  const priced = suggestions.map((product) => {
    /**
     * The product's own answers are the defaults, so a variant that says
     * nothing about how it gets home inherits them rather than being read as
     * shippable — which is what decides the tag below.
     */
    const sizes = productSizes(product.sizes, product.priceCents, {
      ships: product.ships,
      pickup: product.pickup
    });
    return { product, sizes, unlocks: unlocksFreeShippingFor(progress, sizes, product) };
  });
  const anyUnlocks = priced.some((entry) => entry.unlocks);
  const short = Boolean(progress) && !progress?.unlocked;

  return (
    <section className="cart-suggestions" aria-labelledby="cart-suggestions-title">
      <div className="cart-suggestions-head">
        <span className="eyebrow">Complete your order</span>
        <h2 id="cart-suggestions-title">
          {anyUnlocks
            ? 'One of these gets you free shipping.'
            : short
              ? 'A little something to go with it?'
              : 'Goes well with what you chose.'}
        </h2>
        {anyUnlocks && progress && (
          <p>
            You are {formatMoney(progress.remainingCents)} short of free standard shipping
            {progress.savesCents > 0 ? ` — worth ${formatMoney(progress.savesCents)}.` : '.'}
          </p>
        )}
      </div>
      <div className="cart-suggestion-row">
        {priced.map(({ product, sizes, unlocks }) => (
          <article className="cart-suggestion" key={product.slug}>
            <Link href={`/shop/${product.slug}`} aria-label={`View ${product.name}`} tabIndex={-1}>
              <ResilientImage
                sizeRole="thumb"
                src={product.imageUrl || FALLBACK_PRODUCT_IMAGE}
                fallbackSrc="/images/botanical-placeholder.svg"
                alt=""
                width={120}
                height={120}
                loading="lazy"
                decoding="async"
              />
            </Link>
            <div className="cart-suggestion-copy">
              <b>
                <Link href={`/shop/${product.slug}`}>{product.name}</Link>
              </b>
              <span>{formatSizePriceRange(sizes, product.priceCents)}</span>
              {/* The reason is the whole point: without it this strip is just
                  another shelf. */}
              {product.reason && <span>{product.reason}</span>}
              {unlocks && (
                <span className="suggestion-unlock">
                  <Truck size={13} aria-hidden="true" /> Unlocks free shipping
                </span>
              )}
            </div>
            {/* A sized product cannot be added from here — the size is a
                choice — so it is offered as the page where the choice lives. */}
            {sizes.length ? (
              <Link
                className="btn outline small"
                href={`/shop/${product.slug}`}
                aria-label={`Choose a ${sizeFieldLabel(product.sizeLabel).toLowerCase()} for ${product.name}`}
              >
                Choose size
              </Link>
            ) : (
              <button
                className="btn small"
                type="button"
                onClick={() =>
                  addItem({
                    slug: product.slug,
                    name: product.name,
                    priceCents: product.priceCents,
                    imageUrl: product.imageUrl,
                    inventory: product.inventory,
                    type: product.type,
                    ships: product.ships,
                    pickup: product.pickup
                  })
                }
                aria-label={`Add ${product.name} to your basket`}
              >
                Add
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
