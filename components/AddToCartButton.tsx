'use client';

import { useId, useState } from 'react';
import { Minus, Plus, ShoppingBag } from 'lucide-react';
import { useCart, type CartProduct } from '@/components/CartProvider';
import { sizeFieldLabel, sizesArePriced, type SizeOption } from '@/lib/product-sizes';
import { formatMoney } from '@/lib/store';

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
  const [quantity, setQuantity] = useState(1);
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
  const fieldLabel = sizeFieldLabel(sizeLabel);

  function add() {
    if (soldOut || needsSize) return;
    addItem(
      {
        ...product,
        priceCents: chosen?.priceCents ?? product.priceCents,
        size: chosen?.label || null
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
            {sizes.map((option) => (
              <option key={option.label} value={option.label}>
                {showPrices ? `${option.label} — ${formatMoney(option.priceCents)}` : option.label}
              </option>
            ))}
          </select>
          {/* Announced rather than merely shown: the price above the panel is a
              range for a product whose sizes are priced differently, so the
              figure that actually applies has to arrive with the choice. */}
          <p className="size-picker-note" aria-live="polite">
            {chosen
              ? `${chosen.label} · ${formatMoney(chosen.priceCents)} each`
              : `Choose a ${fieldLabel.toLowerCase()} to add this to your basket.`}
          </p>
        </div>
      )}
      <div className="add-to-cart-panel">
        {/* role="group" so the label is exposed — a bare div is `generic`,
            where aria-label is ignored. The cart drawer already does this. */}
        <div className="quantity-picker" role="group" aria-label="Quantity">
          <button
            type="button"
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
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
            onClick={() => setQuantity((value) => Math.min(product.inventory, value + 1))}
            aria-label="Increase quantity"
            disabled={quantity >= product.inventory}
          >
            <Plus size={16} />
          </button>
        </div>
        <button
          className="btn add-button"
          type="button"
          disabled={soldOut || needsSize}
          onClick={add}
        >
          <ShoppingBag size={18} />
          {soldOut
            ? 'Sold out'
            : needsSize
              ? `Choose a ${fieldLabel.toLowerCase()}`
              : 'Add to cart'}
        </button>
      </div>
    </div>
  );
}
