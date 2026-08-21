'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import ResilientImage from '@/components/ResilientImage';
import { useCart, type CartLine } from '@/components/CartProvider';
import CheckoutOptions from '@/components/CheckoutOptions';
import { cartFulfillment } from '@/lib/fulfillment';
import { FALLBACK_PRODUCT_IMAGE, formatMoney } from '@/lib/store';
import FormStatus from '@/components/FormStatus';

export default function CartPageClient({
  catalogEmpty,
  freeShippingThreshold,
  restoreToken,
  canceledSessionId
}: {
  catalogEmpty?: boolean;
  freeShippingThreshold: number;
  restoreToken?: string | null;
  canceledSessionId?: string | null;
}) {
  const {
    items,
    subtotalCents,
    checkoutLoading,
    checkoutError,
    checkoutNotice,
    fulfillment,
    pickupArranged,
    setQuantity,
    removeItem,
    replaceItems,
    checkout
  } = useCart();
  const [saveEmail, setSaveEmail] = useState('');
  const [saveSubscribe, setSaveSubscribe] = useState(false);
  const [saveState, setSaveState] = useState<{ type: 'idle' | 'ok' | 'error'; message?: string }>({
    type: 'idle'
  });
  const [restoreState, setRestoreState] = useState<'idle' | 'loading' | 'ok' | 'error'>(
    restoreToken ? 'loading' : 'idle'
  );
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!canceledSessionId) return;
    const controller = new AbortController();
    fetch('/api/checkout/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: canceledSessionId }),
      signal: controller.signal
    })
      .then(async (response) => {
        const result = (await response.json()) as {
          released?: boolean;
          reason?: string;
          error?: string;
        };
        const paid = result.reason === 'paid';
        const released = response.ok && Boolean(result.released);
        if (paid || released) {
          window.history.replaceState(null, '', '/cart');
        }
        if (paid) return;
        if (!released) {
          setCancelNotice(
            result.error ||
              'Checkout was cancelled. If an item still looks sold out, wait a moment and try again.'
          );
          return;
        }
        setCancelNotice(
          'Checkout was cancelled. Those plants are back on the shelf if you want to try again.'
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setCancelNotice(
          'Checkout was cancelled. If an item still looks sold out, wait a moment and refresh.'
        );
      });
    return () => controller.abort();
  }, [canceledSessionId]);

  useEffect(() => {
    if (!restoreToken) return;
    const controller = new AbortController();
    fetch(`/api/cart-lead?token=${encodeURIComponent(restoreToken)}`, { signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as {
          items?: CartLine[];
          error?: string;
          message?: string;
        };
        if (!response.ok) throw new Error(result.error || 'We could not restore that cart.');
        replaceItems(result.items || []);
        setRestoreState('ok');
        setSaveState({
          type: 'ok',
          message:
            result.message ||
            (result.items?.length
              ? 'Your saved cart is back. Review it and check out when you are ready.'
              : 'That saved cart no longer has items we can restore.')
        });
        window.history.replaceState(null, '', '/cart');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRestoreState('error');
        setSaveState({
          type: 'error',
          message: error instanceof Error ? error.message : 'We could not restore that cart.'
        });
      });
    return () => controller.abort();
  }, [replaceItems, restoreToken]);

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

  if (!items.length && restoreState !== 'loading') {
    return (
      <div className="empty-state">
        <ShoppingBag size={42} aria-hidden="true" />
        {catalogEmpty ? (
          <>
            <h3>Nothing is on the bench right now.</h3>
            <p>
              We only list pieces that are ready to go home. Ask about a custom arrangement, or
              browse the care library while the next batch is potted.
            </p>
            <FormStatus message={checkoutNotice} tone="notice" />
            <FormStatus message={cancelNotice} tone="notice" />
            <FormStatus
              message={saveState.message}
              tone={saveState.type === 'ok' ? 'success' : 'error'}
            />
            <div className="actions" style={{ justifyContent: 'center' }}>
              <Link className="btn" href="/care">
                Plant care library
              </Link>
              <Link className="btn outline" href="/contact?subject=Custom+planter+arrangement">
                Ask about a custom arrangement
              </Link>
            </div>
          </>
        ) : (
          <>
            <h3>Your cart is empty.</h3>
            <p>Explore our current plants, teas and handmade botanical goods.</p>
            <FormStatus message={checkoutNotice} tone="notice" />
            <FormStatus message={cancelNotice} tone="notice" />
            <FormStatus
              message={saveState.message}
              tone={saveState.type === 'ok' ? 'success' : 'error'}
            />
            <Link className="btn" href="/shop">
              Browse the shop
            </Link>
          </>
        )}
      </div>
    );
  }

  const remaining = Math.max(0, freeShippingThreshold - subtotalCents);
  const progress =
    freeShippingThreshold > 0
      ? Math.min(100, Math.round((subtotalCents / freeShippingThreshold) * 100))
      : 100;
  const pickup = fulfillment === 'PICKUP';
  const options = cartFulfillment(items);
  const checkoutBlocked = options.conflict || (pickup && !pickupArranged);

  return (
    <div className="cart-page">
      <div className="cart-page-lines">
        {items.map((item) => (
          <article className="cart-page-line" key={item.slug}>
            <Link href={`/shop/${item.slug}`} aria-label={`View ${item.name}`}>
              <ResilientImage
                sizeRole="thumb"
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
              <p className="muted" style={{ marginTop: 0 }}>
                {formatMoney(item.priceCents)} each
              </p>
              <div className="cart-line-actions">
                <div
                  className="quantity-picker small"
                  role="group"
                  aria-label={`Quantity for ${item.name}`}
                >
                  <button
                    type="button"
                    onClick={() => setQuantity(item.slug, item.quantity - 1)}
                    aria-label={`Decrease ${item.name} quantity`}
                  >
                    <Minus size={14} />
                  </button>
                  {/* The live region announced a bare number — "3" — with nothing to
                      say what changed. */}
                  <span aria-hidden="true">{item.quantity}</span>
                  <span className="sr-only" aria-live="polite">
                    {item.name}: quantity {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(item.slug, item.quantity + 1)}
                    disabled={item.quantity >= item.inventory}
                    aria-label={`Increase ${item.name} quantity`}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <button
                  className="text-button danger"
                  type="button"
                  onClick={() => removeItem(item.slug)}
                >
                  <Trash2 size={14} /> Remove
                </button>
              </div>
            </div>
            <strong>{formatMoney(item.priceCents * item.quantity)}</strong>
          </article>
        ))}
        {catalogEmpty ? (
          <Link className="text-link" href="/care">
            ← Browse the care library
          </Link>
        ) : (
          <Link className="text-link" href="/shop">
            ← Continue shopping
          </Link>
        )}
      </div>

      <aside className="order-summary" aria-label="Order summary">
        <div className="eyebrow">Order summary</div>
        <div className="summary-row">
          <span>Subtotal</span>
          <strong>{formatMoney(subtotalCents)}</strong>
        </div>
        <div className="summary-row">
          <span>{pickup ? 'Pickup' : 'Shipping'}</span>
          <span>{pickup ? 'Free — local pickup' : 'Calculated at checkout'}</span>
        </div>
        <div className="summary-row total">
          <span>Current total</span>
          <span>{formatMoney(subtotalCents)}</span>
        </div>

        <CheckoutOptions />

        {!pickup && freeShippingThreshold > 0 && (
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

        <FormStatus message={checkoutError} tone="error" />
        <FormStatus message={checkoutNotice} tone="notice" />
        <FormStatus message={cancelNotice} tone="notice" />
        <button
          className="btn full"
          type="button"
          onClick={checkout}
          disabled={checkoutLoading || restoreState === 'loading' || checkoutBlocked}
          aria-busy={checkoutLoading}
        >
          {checkoutLoading ? 'Opening secure checkout…' : 'Continue to secure checkout'}
        </button>
        <p className="muted" style={{ fontSize: 12 }}>
          {pickup
            ? 'Arrange pickup with us first. Stripe then collects payment and a contact address.'
            : 'Stripe securely collects payment, billing and shipping information. Promotion codes can be entered during checkout.'}
        </p>

        <form className="save-cart" onSubmit={saveCart}>
          <b>Not ready yet?</b>
          <span>Email yourself this cart and we&rsquo;ll hold onto it.</span>
          <div className="save-cart-row">
            <label className="sr-only" htmlFor="save-cart-email">
              Email address
            </label>
            <input
              id="save-cart-email"
              className="form-input"
              type="email"
              required
              value={saveEmail}
              onChange={(event) => setSaveEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <button className="btn outline small" type="submit">
              Save cart
            </button>
          </div>
          {/* Saving a cart is not consent to be marketed to. The newsletter is a
              separate, explicit opt-in that defaults to off. */}
          <label className="save-cart-consent">
            <input
              type="checkbox"
              checked={saveSubscribe}
              onChange={(event) => setSaveSubscribe(event.target.checked)}
            />
            <span>Also send me seasonal tips, plant care and new arrivals.</span>
          </label>
          <FormStatus
            message={saveState.message}
            tone={saveState.type === 'ok' ? 'success' : 'error'}
          />
        </form>
      </aside>
    </div>
  );
}
