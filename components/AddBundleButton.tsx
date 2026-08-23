'use client';

import { useState } from 'react';
import { Minus, Plus, ShoppingBag } from 'lucide-react';
import { useCart } from '@/components/CartProvider';
import type { BundleCardData } from '@/lib/bundle-queries';

/**
 * Adds a set to the basket.
 *
 * The stepper's ceiling is `bundle.sets` — how many complete sets the bench can
 * build, worked out on the server from the components. It is deliberately not a
 * stored number: there is no such thing as "bundle inventory" here, and the one
 * place a shopper could otherwise ask for more sets than exist is this control.
 */
export default function AddBundleButton({
  bundle,
  compact = false
}: {
  bundle: BundleCardData;
  compact?: boolean;
}) {
  const { addItem, openCart } = useCart();
  const [wanted, setWanted] = useState(1);
  const soldOut = bundle.sets <= 0;
  // Clamped as it renders rather than reset by an effect, so a set whose last
  // component just sold cannot leave a stale 3 in the box.
  const quantity = Math.max(1, Math.min(wanted, bundle.sets || 1));

  function add() {
    if (soldOut) return;
    addItem(
      {
        kind: 'bundle',
        slug: bundle.slug,
        name: bundle.title,
        priceCents: bundle.priceCents,
        imageUrl: bundle.imageUrl,
        inventory: bundle.sets,
        type: 'BUNDLE',
        ships: bundle.ships,
        pickup: bundle.pickup,
        contents: bundle.contents
      },
      quantity
    );
    openCart();
  }

  if (compact) {
    return (
      <button className="btn small" type="button" disabled={soldOut} onClick={add}>
        <ShoppingBag size={16} /> {soldOut ? 'Sold out' : 'Add the set'}
      </button>
    );
  }

  return (
    <div className="add-to-cart-panel">
      <div className="quantity-picker" role="group" aria-label="Number of sets">
        <button
          type="button"
          onClick={() => setWanted(Math.max(1, quantity - 1))}
          aria-label="One fewer set"
        >
          <Minus size={16} />
        </button>
        <span aria-hidden="true">{quantity}</span>
        <span className="sr-only" aria-live="polite">
          {quantity} {quantity === 1 ? 'set' : 'sets'}
        </span>
        <button
          type="button"
          onClick={() => setWanted(Math.min(bundle.sets, quantity + 1))}
          aria-label="One more set"
          disabled={quantity >= bundle.sets}
        >
          <Plus size={16} />
        </button>
      </div>
      <button className="btn add-button" type="button" disabled={soldOut} onClick={add}>
        <ShoppingBag size={18} />
        {soldOut ? 'Sold out' : 'Add the set to cart'}
      </button>
    </div>
  );
}
