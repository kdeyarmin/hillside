'use client';

import Link from 'next/link';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import ResilientImage from '@/components/ResilientImage';
import { useCart } from '@/components/CartProvider';
import { FALLBACK_PRODUCT_IMAGE, formatMoney } from '@/lib/store';

export default function CartPageClient({ freeShippingThreshold }: { freeShippingThreshold: number }) {
  const {
    items,
    subtotalCents,
    checkoutLoading,
    setQuantity,
    removeItem,
    checkout
  } = useCart();

  if (!items.length) {
    return (
      <div className="empty-state">
        <ShoppingBag size={42} />
        <h3>Your cart is empty.</h3>
        <p>Explore Tammy’s current plants, teas and handmade botanical goods.</p>
        <Link className="btn" href="/shop">Browse the shop</Link>
      </div>
    );
  }

  const remaining = Math.max(0, freeShippingThreshold - subtotalCents);
  const progress = freeShippingThreshold > 0
    ? Math.min(100, Math.round((subtotalCents / freeShippingThreshold) * 100))
    : 100;

  return (
    <div className="cart-page">
      <div className="cart-page-lines">
        {items.map((item) => (
          <article className="cart-page-line" key={item.slug}>
            <Link href={`/shop/${item.slug}`} aria-label={`View ${item.name}`}>
              <ResilientImage
                src={item.imageUrl || FALLBACK_PRODUCT_IMAGE}
                fallbackSrc="/images/botanical-placeholder.svg"
                alt={item.name}
                width={110}
                height={110}
                loading="lazy"
                decoding="async"
              />
            </Link>
            <div>
              <h2 style={{ margin: '0 0 5px', color: 'var(--forest)', font: '500 25px Georgia,serif' }}>
                <Link href={`/shop/${item.slug}`}>{item.name}</Link>
              </h2>
              <p className="muted" style={{ marginTop: 0 }}>{formatMoney(item.priceCents)} each</p>
              <div className="cart-line-actions">
                <div className="quantity-picker small" role="group" aria-label={`Quantity for ${item.name}`}>
                  <button
                    type="button"
                    onClick={() => setQuantity(item.slug, item.quantity - 1)}
                    aria-label={`Decrease ${item.name} quantity`}
                  >
                    <Minus size={14} />
                  </button>
                  <span aria-live="polite">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(item.slug, item.quantity + 1)}
                    disabled={item.quantity >= item.inventory}
                    aria-label={`Increase ${item.name} quantity`}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <button className="text-button danger" type="button" onClick={() => removeItem(item.slug)}>
                  <Trash2 size={14} /> Remove
                </button>
              </div>
            </div>
            <strong>{formatMoney(item.priceCents * item.quantity)}</strong>
          </article>
        ))}
        <Link className="text-link" href="/shop">← Continue shopping</Link>
      </div>

      <aside className="order-summary" aria-label="Order summary">
        <div className="eyebrow">Order summary</div>
        <div className="summary-row"><span>Subtotal</span><strong>{formatMoney(subtotalCents)}</strong></div>
        <div className="summary-row"><span>Shipping</span><span>Calculated at checkout</span></div>
        <div className="summary-row total"><span>Current total</span><span>{formatMoney(subtotalCents)}</span></div>

        {freeShippingThreshold > 0 && (
          <div style={{ margin: '18px 0' }}>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Progress toward free shipping"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              {remaining > 0
                ? `Add ${formatMoney(remaining)} more to qualify for free standard shipping.`
                : 'Your order qualifies for free standard shipping.'}
            </p>
          </div>
        )}

        <button
          className="btn full"
          type="button"
          onClick={checkout}
          disabled={checkoutLoading}
          aria-busy={checkoutLoading}
        >
          {checkoutLoading ? 'Opening secure checkout…' : 'Continue to secure checkout'}
        </button>
        <p className="muted" style={{ fontSize: 12 }}>
          Stripe securely collects payment, billing and shipping information. Promotion codes can be
          entered during checkout.
        </p>
      </aside>
    </div>
  );
}
