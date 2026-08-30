'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Facebook,
  Instagram,
  Menu,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X
} from 'lucide-react';
import NewsletterForm from '@/components/NewsletterForm';
import ResilientImage from '@/components/ResilientImage';
import CheckoutOptions from '@/components/CheckoutOptions';
import { giftCardTail } from '@/lib/discount-request';
import { lineKey, useCart } from '@/components/CartProvider';
import { lineCapNote, lineCeiling, lineHref } from '@/lib/cart-lines';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { cartFulfillment } from '@/lib/fulfillment';
import { focusableElements, trapTabKey } from '@/lib/focus-trap';
import { formatSizePriceRange, productSizes, sizedName, sizeFieldLabel } from '@/lib/product-sizes';
import {
  DEFAULT_BUSINESS_EMAIL,
  FALLBACK_PRODUCT_IMAGE,
  formatMoney,
  formatMoneyCompact
} from '@/lib/store';

/**
 * What a basket line is called out loud. Two sizes of one plant are two lines,
 * and "Decrease Monstera quantity" on both would have left a screen reader with
 * no way to tell which button belonged to which pot.
 */
const lineName = (line: { name: string; size?: string | null }) => sizedName(line.name, line.size);

/**
 * The header navigates the shop in three broad groups, and the shop's own chips
 * narrow each one to a category — Plants down to Carnivorous Plants, Botanicals
 * down to Handmade Soap. Two levels, in the two places that suit them: a header
 * cannot hold eighteen categories, and a shopper who wants "something green"
 * should not have to pick which kind of green first.
 *
 * These used to be three collections, locked so the header could not point at a
 * deleted row. Navigating by group instead means nothing in the header depends
 * on a row the owner might rename, so every collection is now hers to retire.
 */
function primaryNavigation(
  giftsEmpty: boolean
): ReadonlyArray<readonly [label: string, href: string]> {
  return [
    ['Plants', '/shop?category=PLANT'],
    ['Teas & Herbals', '/shop?category=TEA'],
    ['Botanicals', '/shop?category=BOTANICAL'],
    /* Gifts leaves with the *stock*, not merely with the catalog. The gift
       pages are built from in-stock rows, so a shop whose every listing has
       sold out has a gift guide with nothing in it — and a header link to it
       is exactly the apology this condition exists to avoid. */
    ...(giftsEmpty ? [] : ([['Gifts', '/gifts']] as const)),
    ...(CLASSES_PUBLICLY_VISIBLE ? ([['Classes', '/classes']] as const) : []),
    ['Plant Care', '/care'],
    ['Gallery', '/gallery'],
    ['Our Picks', '/amazon']
  ];
}

const SOCIAL_LINKS = [
  { label: 'Instagram', href: process.env.NEXT_PUBLIC_INSTAGRAM_URL, Icon: Instagram },
  { label: 'Facebook', href: process.env.NEXT_PUBLIC_FACEBOOK_URL, Icon: Facebook }
].filter((link): link is { label: string; href: string; Icon: typeof Instagram } =>
  Boolean(link.href)
);

function FreeShippingMeter({
  subtotalCents,
  threshold
}: {
  subtotalCents: number;
  threshold: number;
}) {
  if (threshold <= 0 || subtotalCents <= 0) return null;

  const remaining = threshold - subtotalCents;
  const progress = Math.min(100, Math.round((subtotalCents / threshold) * 100));

  return (
    <div className="drawer-shipping">
      <p>
        {remaining > 0 ? (
          <>
            Add <b>{formatMoney(remaining)}</b> more for free standard shipping.
          </>
        ) : (
          <>
            You&rsquo;ve earned <b>free standard shipping</b>.
          </>
        )}
      </p>
      <div className="progress-track" role="presentation">
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

type Suggestion = {
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

function CartDrawerSuggestions() {
  const { items, addItem, closeCart } = useCart();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
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
    fetch(`/api/recommendations?${query.toString()}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { products: [] }))
      .then((data: { products?: Suggestion[] }) => setSuggestions(data.products?.slice(0, 2) || []))
      .catch(() => setSuggestions([]));
    return () => controller.abort();
  }, [sets, slugs]);

  if (!suggestions.length) return null;

  return (
    <div className="drawer-suggestions">
      <span className="eyebrow">Goes well with</span>
      {suggestions.map((product) => {
        const sizes = productSizes(product.sizes, product.priceCents);
        return (
          <div className="drawer-suggestion" key={product.slug}>
            <ResilientImage
              sizeRole="thumb"
              src={product.imageUrl || FALLBACK_PRODUCT_IMAGE}
              fallbackSrc="/images/botanical-placeholder.svg"
              alt={product.name}
              width={54}
              height={54}
              loading="lazy"
              decoding="async"
            />
            <div>
              <b>{product.name}</b>
              <span>{formatSizePriceRange(sizes, product.priceCents)}</span>
              {/* The reason is the whole point: without it this strip is just
                  another shelf, which is what it used to be. */}
              {product.reason && <span>{product.reason}</span>}
            </div>
            {/* A suggestion cannot take a size choice either, so a sized product
                is offered as a link to the page where the choice lives, and says
                so: a bare "Choose" reads as an unexplained refusal to add. The
                visible words stay short because this strip is 272px wide on a
                small phone and the owner's own label ("Pot size") wrapped the
                button onto two lines and squeezed the name beside it — the
                accessible name carries the full, specific version instead. */}
            {sizes.length ? (
              <Link
                className="btn small"
                href={`/shop/${product.slug}`}
                onClick={closeCart}
                aria-label={`Choose a ${sizeFieldLabel(
                  product.sizeLabel
                ).toLowerCase()} for ${product.name}`}
              >
                Choose size
              </Link>
            ) : (
              // Named, because a screen reader listing this panel's controls
              // otherwise reads "Add, Add, Add" with nothing to tell them apart —
              // while the "Choose size" link beside it has always said what it
              // was for.
              <button
                className="btn small"
                type="button"
                onClick={() => addItem(product)}
                aria-label={`Add ${product.name} to your basket`}
              >
                Add
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CartDrawer({
  catalogEmpty,
  freeShippingThreshold
}: {
  catalogEmpty: boolean;
  freeShippingThreshold: number;
}) {
  const {
    items,
    subtotalCents,
    drawerOpen,
    checkoutLoading,
    checkoutError,
    checkoutNotice,
    fulfillment,
    pickupArranged,
    discount,
    closeCart,
    setQuantity,
    removeItem,
    checkout
  } = useCart();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCart();
        return;
      }

      if (event.key !== 'Tab') return;
      if (trapTabKey(event, dialogRef.current, closeButtonRef.current)) event.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [closeCart, drawerOpen]);

  if (!drawerOpen) return null;

  return (
    <div className="drawer-layer">
      <button
        className="drawer-backdrop"
        type="button"
        onClick={closeCart}
        aria-label="Close cart"
        tabIndex={-1}
      />
      {/* A div, not an <aside>: ARIA in HTML does not allow `dialog` on an
          element whose implicit role is `complementary`, and axe reports it.
          The gallery lightbox already uses a div for the same dialog; the
          drawer is styled entirely by class, so the element is free to change. */}
      <div
        className="cart-drawer"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
      >
        <div className="drawer-heading">
          <div>
            <span className="eyebrow">Your basket</span>
            <h2 id="cart-drawer-title">Shopping cart</h2>
          </div>
          <button
            className="icon-button"
            ref={closeButtonRef}
            type="button"
            onClick={closeCart}
            aria-label="Close cart"
          >
            <X />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <ShoppingBag size={38} />
            {checkoutNotice && (
              <p className="drawer-notice" role="status">
                {checkoutNotice}
              </p>
            )}
            {catalogEmpty ? (
              <>
                <h3>Nothing is on the bench right now.</h3>
                <p>
                  We only list pieces that are ready to go home. Ask about a custom arrangement, or
                  browse the care library while the next batch is potted.
                </p>
                <Link className="btn" href="/care" onClick={closeCart}>
                  Plant care library
                </Link>
                <Link
                  className="btn outline"
                  href="/contact?subject=Custom+planter+arrangement"
                  onClick={closeCart}
                >
                  Ask about a custom arrangement
                </Link>
              </>
            ) : (
              <>
                <h3>Your cart is ready for something beautiful.</h3>
                <p>Browse plants, teas and small-batch botanical goods.</p>
                <Link className="btn" href="/shop" onClick={closeCart}>
                  Explore the shop
                </Link>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Lines and suggestions share one scroll region. Given their own
                boxes, the suggestions and the checkout panel below took their
                full height first and left the basket a sliver too short to
                reach a Remove button in. */}
            <div className="drawer-body">
              <div className="cart-lines">
                {items.map((item) => (
                  <div className="cart-line" key={lineKey(item)}>
                    <ResilientImage
                      sizeRole="thumb"
                      src={item.imageUrl || FALLBACK_PRODUCT_IMAGE}
                      fallbackSrc="/images/botanical-placeholder.svg"
                      alt={item.name}
                      width={80}
                      height={80}
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="cart-line-copy">
                      <Link href={lineHref(item)} onClick={closeCart}>
                        <b>{item.name}</b>
                      </Link>
                      {/* Named on the line rather than folded into the title, so
                          two sizes of one plant read as the two lines they are. */}
                      {item.size && <span className="cart-line-size">{item.size}</span>}
                      {/* A set costs one price, so the line has to say what is
                          in the box or the figure looks arbitrary. */}
                      {item.contents && <span className="cart-line-size">{item.contents}</span>}
                      <span>{formatMoney(item.priceCents)}</span>
                      <div className="cart-line-actions">
                        <div
                          className="quantity-picker small"
                          role="group"
                          aria-label={`Quantity for ${lineName(item)}`}
                        >
                          {/* Stops at 1 rather than deleting the line: see the
                              same control on the cart page. */}
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
                        <button
                          className="text-button danger"
                          type="button"
                          onClick={() => removeItem(lineKey(item))}
                        >
                          <Trash2 size={14} /> Remove
                        </button>
                      </div>
                      {item.quantity >= lineCeiling(item) && (
                        <span className="cart-line-cap">{lineCapNote(item)}</span>
                      )}
                    </div>
                    <b>{formatMoney(item.priceCents * item.quantity)}</b>
                  </div>
                ))}
              </div>
              <CartDrawerSuggestions />
              {/* Scrolls with the basket. Pinned beside the subtotal, the
                  fulfillment picker and gift note were half the drawer's height
                  and left nothing for the items themselves. */}
              <div className="drawer-options">
                <CheckoutOptions compact />
              </div>
            </div>
            <div className="drawer-total">
              {fulfillment !== 'PICKUP' && !discount?.freeShipping && (
                <FreeShippingMeter
                  subtotalCents={subtotalCents}
                  threshold={freeShippingThreshold}
                />
              )}
              <div>
                <span>Subtotal</span>
                <strong>{formatMoney(subtotalCents)}</strong>
              </div>
              {/* Applied codes are shown here but only entered on the cart page:
                  the picker and the gift note already fill this panel, and a
                  discount the drawer did not mention would make its subtotal
                  read as the whole story. */}
              {discount && discount.promoDiscountCents > 0 && discount.promotion && (
                <div>
                  <span>{discount.promotion.code}</span>
                  <strong>−{formatMoney(discount.promoDiscountCents)}</strong>
                </div>
              )}
              {discount && discount.giftCardCents > 0 && discount.giftCard && (
                <div>
                  <span>Gift card ending {giftCardTail(discount.giftCard.maskedCode)}</span>
                  <strong>−{formatMoney(discount.giftCardCents)}</strong>
                </div>
              )}
              <p>
                {fulfillment === 'PICKUP'
                  ? 'No shipping charge. Tax is calculated securely in Stripe Checkout.'
                  : discount?.freeShipping
                    ? 'Free shipping with your promo code. Tax is calculated securely in Stripe Checkout.'
                    : 'Shipping and any applicable tax are calculated securely in Stripe Checkout.'}
              </p>
              {checkoutError && (
                <p className="drawer-error" role="alert">
                  {checkoutError}
                </p>
              )}
              {checkoutNotice && (
                <p className="drawer-notice" role="status">
                  {checkoutNotice}
                </p>
              )}
              {/* Says why the button will refuse before it is pressed. The
                  checkbox that clears this lives up in the scrolling body, so on
                  a full basket it is off-screen from here — which is how an
                  unexplained dead button used to be the whole experience. */}
              {fulfillment === 'PICKUP' && !pickupArranged && !cartFulfillment(items).conflict && (
                <p className="drawer-notice" id="drawer-pickup-hint">
                  Tick “I have already arranged this pickup” above to continue.
                </p>
              )}
              <button
                className="btn full"
                type="button"
                onClick={checkout}
                /**
                 * Not disabled for an unarranged pickup on purpose. The disabled
                 * attribute swallowed the click that would have produced
                 * `PICKUP_ARRANGE_ERROR`, so the one explanation the code had was
                 * unreachable — and disabled buttons are skipped by Tab, so a
                 * keyboard shopper could not even land on it to hear why.
                 */
                disabled={checkoutLoading || cartFulfillment(items).conflict}
                aria-describedby={
                  fulfillment === 'PICKUP' && !pickupArranged ? 'drawer-pickup-hint' : undefined
                }
                aria-busy={checkoutLoading}
              >
                {checkoutLoading ? 'Opening secure checkout…' : 'Secure checkout'}
              </button>
              <Link className="text-link centered" href="/cart" onClick={closeCart}>
                View full cart
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function SiteHeader({
  catalogEmpty = false,
  bundlesAvailable = false,
  giftsEmpty = false,
  freeShippingThreshold
}: {
  catalogEmpty?: boolean;
  /**
   * Whether any set can actually be built right now. The link is hidden rather
   * than pointing at an empty page, and the answer is derived from the
   * components — there is no "do we have bundles" flag to go stale.
   */
  bundlesAvailable?: boolean;
  /** Nothing is in stock, so the gift guide has nothing to show. */
  giftsEmpty?: boolean;
  freeShippingThreshold: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { count, drawerOpen, openCart, lastAdded } = useCart();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const navigation = primaryNavigation(giftsEmpty);

  useEffect(() => setMobileOpen(false), [pathname]);

  /**
   * Return focus to the button that opened the menu whenever it closes. Escape
   * already restored it; closing via the backdrop or by navigating did not, which
   * left keyboard focus on a removed element and sent the next Tab back to the top
   * of the document.
   */
  const wasMobileOpen = useRef(false);
  useEffect(() => {
    if (wasMobileOpen.current && !mobileOpen) {
      menuButtonRef.current?.focus();
    }
    wasMobileOpen.current = mobileOpen;
  }, [mobileOpen]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 901px)');
    const closeForDesktop = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) setMobileOpen(false);
    };

    closeForDesktop(media);
    media.addEventListener?.('change', closeForDesktop);
    return () => media.removeEventListener?.('change', closeForDesktop);
  }, []);

  useEffect(() => {
    if (!mobileOpen && !drawerOpen) return;

    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);

    body.classList.add('is-scroll-locked');
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      body.classList.remove('is-scroll-locked');
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [drawerOpen, mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;

    /**
     * The first *link*, not simply the first focusable thing.
     *
     * The first focusable element in this panel is the search box, and focusing
     * a text input is what raises the on-screen keyboard on a phone — so every
     * tap of the menu button, by somebody who wanted to look at the navigation,
     * covered half the navigation with a keyboard they had not asked for. The
     * panel still traps focus and still restores it on close; only the landing
     * spot changed. Falling back to the first focusable element keeps the trap
     * honest if the panel ever holds no links.
     */
    const focusTimer = window.requestAnimationFrame(() => {
      const focusable = focusableElements(mobileMenuRef.current);
      const firstLink = focusable.find((element) => element instanceof HTMLAnchorElement);
      (firstLink || focusable[0])?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        menuButtonRef.current?.focus();
        return;
      }

      if (event.key !== 'Tab') return;
      // The toggle button is part of this cycle on purpose — it sits outside the
      // menu panel but is the control that opened it, so Tab should reach it.
      const focusables = [
        menuButtonRef.current,
        ...focusableElements(mobileMenuRef.current)
      ].filter((element): element is HTMLElement => Boolean(element));
      if (!focusables.length) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (!focusables.includes(active as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileOpen]);

  const isActive = (href: string) => {
    /**
     * A link that carries a filter is never marked current. `usePathname` is
     * all this component reads — deliberately, because `useSearchParams` would
     * pull a Suspense boundary into the root layout — so on /shop it cannot
     * tell the three group links apart, and marking all three as the current
     * page is worse than marking none.
     */
    if (href.includes('?')) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const openMobileCart = () => {
    setMobileOpen(false);
    openCart();
  };

  return (
    <>
      <div className="topbar editorial-topbar">
        {/* Announcing a threshold the shop no longer honours is worse than
            announcing nothing, so this reads the configured figure and steps
            aside entirely when free shipping is switched off. */}
        <span>
          ❧ &nbsp;
          {freeShippingThreshold > 0
            ? `Free shipping on orders ${formatMoneyCompact(freeShippingThreshold)}+`
            : 'Plants, teas and botanicals, potted and packed by hand'}
        </span>
        <div>
          <Link href="/about">About Us</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/care">Plant Care</Link>
        </div>
      </div>

      <header className="editorial-header">
        <div className="container editorial-head-main">
          <form className="header-search" action="/search" role="search">
            {/* The label carries the full description; the placeholder is the
                short form that fits the header's own column. */}
            <label className="sr-only" htmlFor="site-search">
              Search plants, care and products
            </label>
            <Search size={20} aria-hidden="true" />
            <input
              id="site-search"
              type="search"
              name="q"
              placeholder="Search plants and care"
              enterKeyHint="search"
            />
            <button type="submit">Search</button>
          </form>

          <Link href="/" className="brand editorial-brand" aria-label="The Hillside Gardens home">
            <img src="/logo.webp" alt="The Hillside Gardens" width="320" height="309" />
          </Link>

          <div className="header-actions">
            <Link href="/order-status">Orders</Link>
            {/*
              No aria-label. The visible text is "Cart (3)" and the label was
              "Open cart with 3 items", which does not contain the visible string —
              so voice control could not act on "click Cart" (WCAG 2.5.3, Label in
              Name). The visible text is the name; the extra detail is appended
              for screen readers only, and now says "item" when there is one.
            */}
            <button className="editorial-cart" type="button" onClick={openCart}>
              <ShoppingBag size={22} aria-hidden="true" />
              <span>Cart ({count})</span>
              <span className="sr-only">
                — open cart, {count} {count === 1 ? 'item' : 'items'}
              </span>
            </button>
          </div>

          <div className="mobile-header-actions">
            <button
              className="icon-button mobile-cart-button"
              type="button"
              onClick={openMobileCart}
              aria-label={`Open cart, ${count} ${count === 1 ? 'item' : 'items'}`}
            >
              <ShoppingBag size={20} aria-hidden="true" />
              <span className="mobile-cart-count" aria-hidden="true">
                {count}
              </span>
            </button>
            <button
              className="icon-button mobile-menu-button"
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileOpen((value) => !value)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-primary-menu"
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            >
              {mobileOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        <nav className="editorial-nav" aria-label="Primary navigation">
          <div className="container editorial-nav-inner">
            {navigation.map(([label, href]) => (
              <Link
                className={isActive(href) ? 'active' : ''}
                href={href}
                key={href}
                aria-current={isActive(href) ? 'page' : undefined}
              >
                {label}
              </Link>
            ))}
            {bundlesAvailable && (
              <Link
                className={isActive('/bundles') ? 'active' : ''}
                href="/bundles"
                aria-current={isActive('/bundles') ? 'page' : undefined}
              >
                Sets &amp; Kits
              </Link>
            )}
            {!catalogEmpty && (
              <Link className="sale-link" href="/shop?sort=new">
                New Arrivals
              </Link>
            )}
          </div>

          {mobileOpen && (
            <div className="mobile-menu container" id="mobile-primary-menu" ref={mobileMenuRef}>
              <form className="mobile-menu-search" action="/search" role="search">
                <label className="sr-only" htmlFor="mobile-search">
                  Search plants, care and products
                </label>
                <input
                  id="mobile-search"
                  type="search"
                  name="q"
                  placeholder="Search plants and care"
                  enterKeyHint="search"
                />
                <button type="submit">Search</button>
              </form>
              {navigation.map(([label, href]) => (
                <Link href={href} key={href} aria-current={isActive(href) ? 'page' : undefined}>
                  {label}
                </Link>
              ))}
              {!catalogEmpty && <Link href="/shop">Shop everything</Link>}
              {bundlesAvailable && (
                <Link href="/bundles" aria-current={isActive('/bundles') ? 'page' : undefined}>
                  Sets &amp; Kits
                </Link>
              )}
              {!catalogEmpty && <Link href="/shop?sort=new">New Arrivals</Link>}
              <Link
                href="/order-status"
                aria-current={pathname === '/order-status' ? 'page' : undefined}
              >
                Order Status
              </Link>
              <Link href="/about" aria-current={pathname === '/about' ? 'page' : undefined}>
                About Us
              </Link>
              <Link href="/contact" aria-current={pathname === '/contact' ? 'page' : undefined}>
                Contact
              </Link>
            </div>
          )}
        </nav>
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {lastAdded || ''}
      </p>

      {mobileOpen && (
        <button
          className="mobile-menu-page-backdrop"
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileOpen(false)}
          tabIndex={-1}
        />
      )}

      <CartDrawer catalogEmpty={catalogEmpty} freeShippingThreshold={freeShippingThreshold} />
    </>
  );
}

/**
 * `contactEmail` arrives as a prop because `BUSINESS_EMAIL` is a server-only
 * variable — reading `process.env` here would compile to `undefined` in the
 * browser bundle and quietly drop the address from the footer.
 */
export function SiteFooter({
  contactEmail = DEFAULT_BUSINESS_EMAIL,
  catalogEmpty = false,
  bundlesAvailable = false,
  giftsEmpty = false
}: {
  contactEmail?: string;
  catalogEmpty?: boolean;
  /** Hidden while no set can be built, for the same reason the header link is. */
  bundlesAvailable?: boolean;
  /** Nothing is in stock, so the gift guide has nothing to show. */
  giftsEmpty?: boolean;
}) {
  const pathname = usePathname();
  const showNewsletter = pathname !== '/';

  return (
    <footer className={`footer${showNewsletter ? '' : ' footer-without-newsletter'}`}>
      {showNewsletter && (
        <div className="container footer-newsletter">
          <div>
            <div className="eyebrow">The Hillside Notes</div>
            <h3>Seasonal tips, plant care and new arrivals.</h3>
          </div>
          {/* The footer is on every page, so the placement alone would not tell
              Tammy anything. `NewsletterForm` sends the current path with it. */}
          <NewsletterForm compact source="footer" />
        </div>
      )}
      <div className="container footergrid">
        <div className="footer-brand">
          <img
            src="/logo.webp"
            alt="The Hillside Gardens"
            width="320"
            height="309"
            loading="lazy"
            decoding="async"
          />
          <p>
            Plants, teas and botanicals chosen with care, plus approachable education to help you
            grow with confidence.
          </p>
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          {SOCIAL_LINKS.length > 0 && (
            <div className="footer-social">
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <a
                  href={href}
                  key={label}
                  aria-label={label}
                  target="_blank"
                  rel="me noopener noreferrer"
                >
                  <Icon size={19} />
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <h4>Explore</h4>
          {!catalogEmpty && (
            <p>
              <Link href="/shop">Shop</Link>
            </p>
          )}
          {bundlesAvailable && (
            <p>
              <Link href="/bundles">Sets &amp; kits</Link>
            </p>
          )}
          {!giftsEmpty && (
            <p>
              <Link href="/gifts">Gift guide</Link>
            </p>
          )}
          {CLASSES_PUBLICLY_VISIBLE && (
            <p>
              <Link href="/classes">Classes</Link>
            </p>
          )}
          <p>
            <Link href="/care">Care sheets</Link>
          </p>
          <p>
            <Link href="/collections">Collections</Link>
          </p>
          <p>
            {/* The local page is where "plant shop near me" lands, so it needs a
                link from every page rather than only from the sitemap. */}
            <Link href="/visit">Visit &amp; local pickup</Link>
          </p>
          <p>
            <Link href="/gallery">Gallery</Link>
          </p>
        </div>
        <div>
          <h4>Customer care</h4>
          <p>
            <Link href="/order-status">Order status</Link>
          </p>
          <p>
            <Link href="/shipping-returns">Shipping & returns</Link>
          </p>
          <p>
            <Link href="/faq">Frequently asked questions</Link>
          </p>
          <p>
            <Link href="/contact">Contact us</Link>
          </p>
        </div>
        <div>
          <h4>Information</h4>
          <p>
            <Link href="/about">About us</Link>
          </p>
          <p>
            <Link href="/amazon">Our Amazon picks</Link>
          </p>
          <p>
            <Link href="/privacy">Privacy</Link>
          </p>
          <p>
            <Link href="/terms">Terms</Link>
          </p>
        </div>
      </div>
      <div className="container footer-bottom">
        <small>© {new Date().getFullYear()} The Hillside Gardens. All rights reserved.</small>
        <small>Plants • Teas • Botanicals</small>
      </div>
    </footer>
  );
}
