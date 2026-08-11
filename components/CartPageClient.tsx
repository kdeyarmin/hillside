'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import ResilientImage from '@/components/ResilientImage';
import { useCart } from '@/components/CartProvider';
import { FALLBACK_PRODUCT_IMAGE, formatMoney } from '@/lib/store';

export default function CartPageClient({ freeShippingThreshold }: { freeShippingThreshold: number }) {
  const {
    items,
    subtotalCents,
    checkoutLoading,
    checkoutError,
    checkoutNotice,
    setQuantity,
    removeItem,
    checkout
  } = useCart();
  const [saveEmail, setSaveEmail] = useState('');
  const [saveSubscribe, setSaveSubscribe] = useState(false);
  const [saveState, setSaveState] = useState<{ type: 'idle' | 'ok' | 'error'; message?: string }>({
    type: 'idle'
  });

  /**
   * Carts live only in this browser, so leaving used to lose the basket and the
   * customer. Saving it against an email makes both recoverable.
   */
  async function saveCart(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const response = await fetch('/api/cart-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: saveEmail,
          subtotalCents,
          subscribe: saveSubscribe,
          items: items.map((item) => ({ slug: item.slug, quantity: item.quantity }))
        })
      });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'We could not save your cart.');
      setSaveState({ type: 'ok', message: result.message });
      setSaveEmail('');
      setSaveSubscribe(false);
    } catch (error) {
      setSaveState({
        type: 'error',
        message: error instanceof Error ? error.message : 'We could not save your cart.'
      });
    }
  }

  if (!items.length) {
    return (
      <div className="empty-state">
        <ShoppingBag size={42} />
        <h3>Your cart is empty.</h3>
        <p>Explore our current plants, teas and handmade botanical goods.</p>
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
              {/* Styled by class, not by an inline `font` shorthand: inline styles
                  outrank the stylesheet, so hardcoding Georgia here opted the cart
                  out of the brand display face every other heading uses. */}
              <h2 className="cart-page-line-title">
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

        {checkoutError && <p className="form-status error" role="alert">{checkoutError}</p>}
        {checkoutNotice && <p className="form-status notice" role="status">{checkoutNotice}</p>}
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

        <form className="save-cart" onSubmit={saveCart}>
          <b>Not ready yet?</b>
          <span>Email yourself this cart and we&rsquo;ll hold onto it.</span>
          <div className="save-cart-row">
            <label className="sr-only" htmlFor="save-cart-email">Email address</label>
            <input
              id="save-cart-email"
              className="form-input"
              type="email"
              required
              value={saveEmail}
              onChange={(event) => setSaveEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <button className="btn outline small" type="submit">Save cart</button>
          </div>
          {/* Saving a cart is not consent to be marketed to. The newsletter is a
              separate, explicit opt-in that defaults to off. */}
          <label className="save-cart-consent">
            <input
              type="checkbox"
              checked={saveSubscribe}
              onChange={(event) => setSaveSubscribe(event.target.checked)}
            />
            <span>Also send me seasonal tips, class dates and new arrivals.</span>
          </label>
          {saveState.message && (
            <p className={`form-status ${saveState.type === 'ok' ? 'success' : 'error'}`} role="status">
              {saveState.message}
            </p>
          )}
        </form>
      </aside>
    </div>
  );
}
