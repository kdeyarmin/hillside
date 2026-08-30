'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import ResilientImage from '@/components/ResilientImage';
import { lineKey, useCart, type CartLine } from '@/components/CartProvider';
import CheckoutOptions from '@/components/CheckoutOptions';
import DiscountCodeFields from '@/components/DiscountCodeFields';
import { lineCapNote, lineCeiling, lineHref } from '@/lib/cart-lines';
import { giftCardTail } from '@/lib/discount-request';
import { cartFulfillment } from '@/lib/fulfillment';
import { sizedName } from '@/lib/product-sizes';
import { FALLBACK_PRODUCT_IMAGE, formatMoney } from '@/lib/store';
import FormStatus from '@/components/FormStatus';

/** See `SiteChrome`: sized lines need names that tell them apart. */
const lineName = (line: { name: string; size?: string | null }) => sizedName(line.name, line.size);

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
    discount,
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
  const [saving, setSaving] = useState(false);

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
    // Without this, a slow network looks like nothing happened and a second
    // press sends the basket again.
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/cart-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: saveEmail,
          subtotalCents,
          subscribe: saveSubscribe,
          items: items.map((item) => ({
            slug: item.slug,
            quantity: item.quantity,
            ...(item.kind === 'bundle' ? { kind: 'bundle' } : {}),
            ...(item.size ? { size: item.size } : {})
          }))
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
    } finally {
      setSaving(false);
    }
  }

  if (restoreState === 'loading' && !items.length) {
    /**
     * The saved-cart fetch is in flight. Rendering the full cart layout here
     * showed empty lines under a $0.00 summary, which reads as a broken cart
     * rather than one still arriving.
     */
    return (
      <div className="empty-state">
        <ShoppingBag size={42} aria-hidden="true" />
        <h3>Restoring your saved cart…</h3>
        <p className="muted" role="status">
          One moment while we put those pieces back in your basket.
        </p>
      </div>
    );
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
  /**
   * A conflicted cart is the only state the button itself refuses, and
   * `CheckoutOptions` prints the reason for that one directly above. An
   * unarranged pickup is *not* blocked here: pressing runs `checkout()`, which
   * answers with `PICKUP_ARRANGE_ERROR` in the status slot. Disabling it swallowed
   * the click and left the customer with a dead button and no explanation.
   */
  const checkoutBlocked = options.conflict;
  const pickupNeedsArranging = pickup && !pickupArranged && !options.conflict;

  return (
    <div className="cart-page">
      <div className="cart-page-lines">
        {items.map((item) => (
          <article className="cart-page-line" key={lineKey(item)}>
            <Link href={lineHref(item)} aria-label={`View ${lineName(item)}`}>
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
                <Link href={lineHref(item)}>{item.name}</Link>
              </h2>
              {item.size && <p className="cart-line-size">{item.size}</p>}
              {/* A set costs one price, so the line has to say what is in the
                  box or the figure looks arbitrary. */}
              {item.contents && <p className="cart-line-size">{item.contents}</p>}
              <p className="muted" style={{ marginTop: 0 }}>
                {formatMoney(item.priceCents)} each
              </p>
              <div className="cart-line-actions">
                <div
                  className="quantity-picker small"
                  role="group"
                  aria-label={`Quantity for ${lineName(item)}`}
                >
                  {/* Stops at 1 rather than deleting the line. Decrementing past
                      one removed the item outright — no confirmation, no undo,
                      and for a keyboard shopper the button they had just pressed
                      vanished, dropping focus to the top of the document. Remove
                      is the deliberate way to take a line out, and it is
                      immediately to the right. */}
                  <button
                    type="button"
                    onClick={() => setQuantity(lineKey(item), item.quantity - 1)}
                    disabled={item.quantity <= 1}
                    aria-label={`Decrease ${lineName(item)} quantity`}
                  >
                    <Minus size={14} />
                  </button>
                  {/* The live region announced a bare number — "3" — with nothing to
                      say what changed. */}
                  <span aria-hidden="true">{item.quantity}</span>
                  <span className="sr-only" aria-live="polite">
                    {lineName(item)}: quantity {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(lineKey(item), item.quantity + 1)}
                    disabled={item.quantity >= lineCeiling(item)}
                    aria-label={`Increase ${lineName(item)} quantity`}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {item.quantity >= lineCeiling(item) && (
                  <p className="muted cart-line-cap">{lineCapNote(item)}</p>
                )}
                <button
                  className="text-button danger"
                  type="button"
                  onClick={() => removeItem(lineKey(item))}
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
        {discount && discount.promoDiscountCents > 0 && discount.promotion && (
          <div className="summary-row discount">
            <span>{discount.promotion.code}</span>
            <strong>−{formatMoney(discount.promoDiscountCents)}</strong>
          </div>
        )}
        {discount && discount.giftCardCents > 0 && discount.giftCard && (
          <div className="summary-row discount">
            {/* Named by its tail rather than by the whole masked number: a
                summary row is narrow, and the bullets wrapped mid-code. */}
            <span>Gift card ending {giftCardTail(discount.giftCard.maskedCode)}</span>
            <strong>−{formatMoney(discount.giftCardCents)}</strong>
          </div>
        )}
        <div className="summary-row">
          <span>{pickup ? 'Pickup' : 'Shipping'}</span>
          <span>
            {pickup
              ? 'Free — local pickup'
              : discount?.freeShipping
                ? 'Free — promo code'
                : 'Calculated at checkout'}
          </span>
        </div>
        <div className="summary-row total">
          <span>Current total</span>
          {/* The quote covers merchandise and shipping. Tax is Stripe's to add,
              which is why this stays "current" rather than "total". */}
          <span>{formatMoney(discount ? discount.totalCents : subtotalCents)}</span>
        </div>

        <DiscountCodeFields />

        <CheckoutOptions />

        {!pickup && !discount?.freeShipping && freeShippingThreshold > 0 && (
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
        {pickupNeedsArranging && (
          <p className="muted" id="cart-pickup-hint" style={{ fontSize: 13 }}>
            Tick “I have already arranged this pickup” above to continue.
          </p>
        )}
        <button
          className="btn full"
          type="button"
          onClick={checkout}
          disabled={checkoutLoading || restoreState === 'loading' || checkoutBlocked}
          aria-describedby={pickupNeedsArranging ? 'cart-pickup-hint' : undefined}
          aria-busy={checkoutLoading}
        >
          {checkoutLoading ? 'Opening secure checkout…' : 'Continue to secure checkout'}
        </button>
        <p className="muted" style={{ fontSize: 12 }}>
          {pickup
            ? 'Arrange pickup with us first. Stripe then collects payment and a contact address.'
            : 'Stripe securely collects payment, billing and shipping information.'}
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
              autoComplete="email"
              required
              value={saveEmail}
              onChange={(event) => setSaveEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <button className="btn outline small" type="submit" disabled={saving} aria-busy={saving}>
              {saving ? 'Saving…' : 'Save cart'}
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
