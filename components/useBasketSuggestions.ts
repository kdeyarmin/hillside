'use client';

import { useEffect, useState } from 'react';
import { useCart } from '@/components/CartProvider';

/** One product the shop suggests beside the basket, as `/api/recommendations` answers. */
export type BasketSuggestion = {
  slug: string;
  name: string;
  priceCents: number;
  imageUrl: string | null;
  inventory: number;
  type: string;
  ships?: boolean;
  pickup?: boolean;
  sizes?: unknown;
  sizeLabel?: string | null;
  /** Why this is being offered, from the same rules the product page uses. */
  reason?: string | null;
};

/**
 * What goes well with the basket, kept in step with it.
 *
 * The drawer and the cart page both ask, and used to ask differently: the
 * drawer fetched its own two, the page had none at all. One hook, so both read
 * the same rules and a change to the basket refreshes both. `limit` is how
 * many the caller has room for; the route caps it.
 */
export function useBasketSuggestions(limit: number) {
  const { items } = useCart();
  const [suggestions, setSuggestions] = useState<BasketSuggestion[]>([]);
  // Sets are sent separately: their slugs live in their own namespace, and the
  // server anchors on what is inside the box rather than on the box.
  const slugs = items
    .filter((item) => item.kind !== 'bundle')
    .map((item) => item.slug)
    .join(',');
  const sets = items
    .filter((item) => item.kind === 'bundle')
    .map((item) => item.slug)
    .join(',');

  useEffect(() => {
    if (!slugs && !sets) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (slugs) query.set('exclude', slugs);
    if (sets) query.set('sets', sets);
    query.set('limit', String(limit));
    fetch(`/api/recommendations?${query.toString()}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { products: [] }))
      .then((data: { products?: BasketSuggestion[] }) =>
        setSuggestions(data.products?.slice(0, limit) || [])
      )
      .catch(() => setSuggestions([]));
    return () => controller.abort();
  }, [limit, sets, slugs]);

  return suggestions;
}
