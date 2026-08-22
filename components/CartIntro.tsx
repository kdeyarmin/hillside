'use client';

import { useCart } from '@/components/CartProvider';

/**
 * The one sentence under "Shopping cart."
 *
 * The basket lives in `localStorage`, so the page around it is rendered on the
 * server with no idea whether there is anything in it. The heading therefore
 * told everyone to "Review quantities before continuing to secure Stripe
 * Checkout" — directly above an empty state saying the cart was empty. This is
 * the smallest piece of the page that has to know, so it is the only piece that
 * reads the cart.
 */
export default function CartIntro({ catalogEmpty = false }: { catalogEmpty?: boolean }) {
  const { items } = useCart();

  if (catalogEmpty) {
    return <p>The bench is between batches, so there is nothing new to add right now.</p>;
  }

  return (
    <p>
      {items.length
        ? 'Review quantities before continuing to secure Stripe Checkout.'
        : 'Nothing in the basket yet — everything you add is held here until you check out.'}
    </p>
  );
}
