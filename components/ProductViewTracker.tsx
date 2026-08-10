'use client';

import { useEffect } from 'react';
import { toGtagItem, trackViewItem } from '@/lib/analytics';

/**
 * Emits the GA4 `view_item` event for a product page. Without it the analytics
 * funnel started at add-to-cart, leaving view-to-cart conversion unmeasurable.
 */
export default function ProductViewTracker({
  slug,
  name,
  type,
  priceCents
}: {
  slug: string;
  name: string;
  type: string;
  priceCents: number;
}) {
  useEffect(() => {
    trackViewItem(toGtagItem({ slug, name, type, priceCents }));
  }, [name, priceCents, slug, type]);

  return null;
}
