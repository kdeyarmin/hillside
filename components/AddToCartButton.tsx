'use client';

import { useId, useState } from 'react';
import { Minus, Plus, ShoppingBag } from 'lucide-react';
import ResilientImage from '@/components/ResilientImage';
import { useCart, type CartProduct } from '@/components/CartProvider';
import {
  sizeAvailable,
  sizeFieldLabel,
  sizesArePriced,
  sizesTrackStock,
  variantsDifferOnFulfillment,
  type SizeOption
} from '@/lib/product-sizes';
import { formatMoney, LINE_QUANTITY_MAX } from '@/lib/store';

export default function AddToCartButton({
  product,
  sizes = [],
  sizeLabel
}: {
  product: CartProduct;
  /** Empty for a product sold one way; otherwise the sizes to choose between. */
  sizes?: SizeOption[];
  sizeLabel?: string | null;
}) {
  const { addItem, openCart } = useCart();
  const [wanted, setWanted] = useState(1);
  /**
   * Nothing is preselected. A default would let a shopper add a 4" pot while
   * meaning to buy the 6", so the button stays disabled until they say which.
   */
  const [size, setSize] = useState('');
  const selectId = useId();
  const soldOut = product.inventory <= 0;
  const chosen = sizes.find((option) => option.label === size) || null;
  const needsSize = sizes.length > 0 && !chosen;
  const showPrices = sizesArePriced(sizes, product.priceCents);
  const countedSizes = sizesTrackStock(sizes);
  const fieldLabel = sizeFieldLabel(sizeLabel);
  /**
   * Only worth saying per variant when the variants disagree. A shop where
   * everything ships should not print "ships" against every pot size.
   */
  const showFulfillment = variantsDifferOnFulfillment(sizes);

  /**
   * What the stepper may climb to. Before a size is picked that is the whole
   * product; after, it is that size's own count where the owner keeps one — a
   * plant with nine on the bench and two 6" pots left may be added twice, not
   * nine times.
   */
  const available = chosen
    ? sizeAvailable(chosen, product.inventory)
    : Math.max(0, product.inventory);
  const chosenSoldOut = Boolean(chosen) && available <= 0;
  /**
   * The shelf is not the only ceiling: checkout will not sell more than
   * `LINE_QUANTITY_MAX` of one line, so a stepper that climbed past it built a
   * basket the till would silently cut back. `available` itself stays the real
   * count — it is what the line carries into the basket, and what "only N left"
   * is counted from.
   */
  const stepperMax = Math.min(available, LINE_QUANTITY_MAX);
  // Clamped as it is rendered rather than reset by an effect, so switching from
  // a size with six left to one with two corrects the number on the same paint.
  const quantity = Math.max(1, Math.min(wanted, stepperMax || 1));

  function add() {
    if (soldOut || needsSize || chosenSoldOut) return;
    addItem(
      {
        ...product,
        priceCents: chosen?.priceCents ?? product.priceCents,
        // The basket line caps itself against the size it holds, not against the
        // product's total, so the drawer cannot climb past what is on the bench.
        inventory: available,
        size: chosen?.label || null,
        /**
         * A variant may get home differently from its product — a 30" specimen
         * that cannot post safely beside 4" pots that can. The basket has to
         * carry the variant's answer, because that is what decides whether the
         * whole cart can be shipped.
         */
        ships: chosen ? chosen.ships : product.ships,
        pickup: chosen ? chosen.pickup : product.pickup,
        imageUrl: chosen?.imageUrl ?? product.imageUrl
      },
      quantity
    );
    openCart();
  }

  return (
    <div className="add-to-cart">
      {sizes.length > 0 && (
        <div className="size-picker">
          <label className="size-picker-label" htmlFor={selectId}>
            {fieldLabel}
          </label>
          <select
            id={selectId}
            className="form-input size-select"
            value={size}
            onChange={(event) => setSize(event.target.value)}
          >
            <option value="">Choose {fieldLabel.toLowerCase()}…</option>
            {sizes.map((option) => {
              const stock = sizeAvailable(option, product.inventory);
              return (
                /**
                 * A size with none on the bench is shown and disabled rather
                 * than dropped: a shopper who came for the 6" pot needs to see
                 * that it exists and is out, not to wonder whether the shop
                 * stopped making it.
                 */
                <option key={option.label} value={option.label} disabled={stock <= 0}>
                  {showPrices
                    ? `${option.label} — ${formatMoney(option.priceCents)}`
                    : option.label}
                  {countedSizes && stock <= 0 ? ' (sold out)' : ''}
                </option>
              );
            })}
          </select>
          {/* Announced rather than merely shown: the price above the panel is a
              range for a product whose sizes are priced differently, so the
              figure that actually applies has to arrive with the choice. */}
          <p className="size-picker-note" aria-live="polite">
            {!chosen
              ? `Choose a ${fieldLabel.toLowerCase()} to add this to your basket.`
              : chosenSoldOut
                ? `${chosen.label} is sold out just now — try another ${fieldLabel.toLowerCase()}.`
                : `${chosen.label} · ${formatMoney(chosen.priceCents)} each${
                    countedSizes && available <= 3 ? ` · only ${available} left` : ''
                  }`}
          </p>
          {/* A variant with a photograph of its own is a visibly different thing
              — a decorative planter is not the nursery pot beside it — and that
              photograph was only reaching the basket, after the sale. The
              gallery above is not ours to drive from here, so the chosen one is
              shown in the panel where the choice was made. */}
          {chosen?.imageUrl && chosen.imageUrl !== product.imageUrl && (
            <ResilientImage
              className="size-picker-photo"
              sizeRole="thumb"
              src={chosen.imageUrl}
              fallbackSrc="/images/botanical-placeholder.svg"
              alt={`${product.name} — ${chosen.label}`}
              width={220}
              height={220}
              loading="lazy"
              decoding="async"
            />
          )}
          {/* What arrives changes with the choice, so the measurements and the
              way it gets home arrive with it too rather than describing a
              different pot further up the page. */}
          {chosen && !chosenSoldOut && (chosen.dimensions || showFulfillment) && (
            <p className="size-picker-detail">
              {chosen.dimensions}
              {chosen.dimensions && showFulfillment ? ' · ' : ''}
              {showFulfillment
                ? chosen.ships && chosen.pickup
                  ? 'Ships or local pickup'
                  : chosen.ships
                    ? 'Ships to US addresses'
                    : 'Local pickup only'
                : ''}
            </p>
          )}
        </div>
      )}
      <div className="add-to-cart-panel">
        {/* role="group" so the label is exposed — a bare div is `generic`,
            where aria-label is ignored. The cart drawer already does this. */}
        <div className="quantity-picker" role="group" aria-label="Quantity">
          <button
            type="button"
            onClick={() => setWanted(Math.max(1, quantity - 1))}
            aria-label="Decrease quantity"
          >
            <Minus size={16} />
          </button>
          <span aria-hidden="true">{quantity}</span>
          <span className="sr-only" aria-live="polite">
            Quantity {quantity}
          </span>
          <button
            type="button"
            onClick={() => setWanted(Math.min(stepperMax, quantity + 1))}
            aria-label="Increase quantity"
            disabled={quantity >= stepperMax}
          >
            <Plus size={16} />
          </button>
        </div>
        <button
          className="btn add-button"
          type="button"
          disabled={soldOut || needsSize || chosenSoldOut}
          onClick={add}
        >
          <ShoppingBag size={18} />
          {soldOut || chosenSoldOut
            ? 'Sold out'
            : needsSize
              ? `Choose a ${fieldLabel.toLowerCase()}`
              : 'Add to cart'}
        </button>
      </div>
    </div>
  );
}
