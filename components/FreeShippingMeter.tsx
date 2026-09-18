'use client';

import { Truck } from 'lucide-react';
import { freeShippingCopy, type FreeShippingProgress } from '@/lib/free-shipping';

/**
 * How far the basket is from free shipping, and what getting there is worth.
 *
 * One component for the drawer and the cart page. The drawer's version is a
 * line and a bar above the subtotal; the cart page's is a card at the top of
 * the summary, because on that page it used to be a muted line *below* the
 * checkout button — the one fact most likely to make somebody add a second
 * plant, said last and quietest.
 */
export default function FreeShippingMeter({
  progress,
  compact = false
}: {
  progress: FreeShippingProgress;
  compact?: boolean;
}) {
  const copy = freeShippingCopy(progress);
  const sentence = (
    <>
      {copy.before}
      <b>{copy.emphasis}</b>
      {copy.after}
    </>
  );
  const bar = (
    <div
      className="progress-track"
      role="progressbar"
      aria-label="Progress toward free shipping"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress.percent}
    >
      <span style={{ width: `${progress.percent}%` }} />
    </div>
  );

  if (compact) {
    return (
      <div className={progress.unlocked ? 'drawer-shipping unlocked' : 'drawer-shipping'}>
        <p>{sentence}</p>
        {bar}
      </div>
    );
  }

  return (
    <div className={progress.unlocked ? 'shipping-meter unlocked' : 'shipping-meter'}>
      <p>
        <Truck size={17} aria-hidden="true" />
        <span>{sentence}</span>
      </p>
      {bar}
    </div>
  );
}
