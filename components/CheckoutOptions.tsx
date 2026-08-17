'use client';

import Link from 'next/link';
import { cartFulfillment, GIFT_MESSAGE_MAX, PICKUP_ARRANGE_HREF } from '@/lib/fulfillment';
import { useCart } from '@/components/CartProvider';

export default function CheckoutOptions({ compact = false }: { compact?: boolean }) {
  const {
    items,
    fulfillment,
    setFulfillment,
    giftMessage,
    setGiftMessage,
    pickupArranged,
    setPickupArranged
  } = useCart();
  const options = cartFulfillment(items);

  if (!items.length) return null;

  return (
    <div className={compact ? 'checkout-options compact' : 'checkout-options'}>
      {options.conflict ? (
        <p className="drawer-error" role="alert">
          This cart mixes pieces that only ship with pieces that are pickup only. Remove one group
          to continue.
        </p>
      ) : (
        <fieldset className="fulfillment-picker">
          <legend>How should we get this to you?</legend>
          {options.canShip && (
            <label htmlFor={compact ? 'drawer-fulfillment-ship' : 'cart-fulfillment-ship'}>
              <input
                id={compact ? 'drawer-fulfillment-ship' : 'cart-fulfillment-ship'}
                type="radio"
                name={compact ? 'drawer-fulfillment' : 'cart-fulfillment'}
                checked={fulfillment === 'SHIP'}
                onChange={() => setFulfillment('SHIP')}
              />
              <span>
                <b>Ship to me</b>
                <small>US shipping. The exact charge is shown before you pay.</small>
              </span>
            </label>
          )}
          {options.canPickup && (
            <label htmlFor={compact ? 'drawer-fulfillment-pickup' : 'cart-fulfillment-pickup'}>
              <input
                id={compact ? 'drawer-fulfillment-pickup' : 'cart-fulfillment-pickup'}
                type="radio"
                name={compact ? 'drawer-fulfillment' : 'cart-fulfillment'}
                checked={fulfillment === 'PICKUP'}
                onChange={() => setFulfillment('PICKUP')}
              />
              <span>
                <b>Local pickup</b>
                <small>Arrange a time with us first, then choose this option.</small>
              </span>
            </label>
          )}
        </fieldset>
      )}

      {options.canPickup && fulfillment === 'PICKUP' && !options.conflict && (
        <div className="pickup-arrange">
          <p>
            <Link className="text-link" href={PICKUP_ARRANGE_HREF}>
              Contact us to arrange pickup
            </Link>{' '}
            before you pay. We will confirm a window, then you can check out as a pickup.
          </p>
          <label>
            <input
              type="checkbox"
              checked={pickupArranged}
              onChange={(event) => setPickupArranged(event.target.checked)}
            />
            <span>I have already arranged this pickup with The Hillside Gardens.</span>
          </label>
        </div>
      )}

      <label className="gift-message-field">
        <span>Gift message (optional)</span>
        <textarea
          value={giftMessage}
          maxLength={GIFT_MESSAGE_MAX}
          rows={compact ? 2 : 3}
          onChange={(event) => setGiftMessage(event.target.value)}
          placeholder="A short note for the recipient. We include it with the order."
        />
        <small>
          {giftMessage.length}/{GIFT_MESSAGE_MAX}
        </small>
      </label>
    </div>
  );
}
