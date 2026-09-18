'use client';

import { Truck } from 'lucide-react';
import { useCart } from '@/components/CartProvider';
import { freeShippingProgress, unlocksFreeShipping } from '@/lib/free-shipping';
import { formatMoney, formatMoneyCompact } from '@/lib/store';

/**
 * The free-shipping line in a product's buy box, and it knows about the basket.
 *
 * It used to state the threshold and stop. A shopper with $60 of plants in the
 * basket looking at a $20 pot was told "free shipping over $75" and left to do
 * the sum; now the line does it — "add this and your order ships free" — which
 * is the sentence that sells the second plant. The server has no basket, so the
 * first paint is the plain statement and the basket-aware one arrives with
 * hydration, exactly as the cart count in the header does.
 */
export default function ShippingNudge({
  thresholdCents,
  flatCents,
  minPriceCents
}: {
  thresholdCents: number;
  flatCents: number;
  /** The cheapest size, so the promise holds whichever one is picked. */
  minPriceCents: number;
}) {
  const { items, subtotalCents, fulfillment } = useCart();
  const progress = freeShippingProgress({ subtotalCents, thresholdCents, flatCents });
  if (!progress) return null;

  const basketCounts = items.length > 0 && fulfillment !== 'PICKUP';
  let text: string;
  if (!basketCounts) {
    text =
      minPriceCents >= thresholdCents
        ? 'This item alone qualifies for free standard shipping on a shipped order.'
        : `Free standard shipping on orders over ${formatMoneyCompact(thresholdCents)}.`;
  } else if (progress.unlocked) {
    text = 'Your basket already ships free — this one rides along.';
  } else if (unlocksFreeShipping(progress, minPriceCents)) {
    text =
      progress.savesCents > 0
        ? `Add this and your order ships free — saving the ${formatMoney(progress.savesCents)} postage.`
        : 'Add this and your order ships free.';
  } else {
    text = `Add this and you are ${formatMoney(progress.remainingCents - minPriceCents)} from free standard shipping.`;
  }

  return (
    <p className="shipping-nudge">
      <Truck size={17} aria-hidden="true" />
      {text}
    </p>
  );
}
