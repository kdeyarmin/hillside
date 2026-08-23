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
import { lineKey, useCart } from '@/components/CartProvider';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { cartFulfillment } from '@/lib/fulfillment';
import { focusableElements, trapTabKey } from '@/lib/focus-trap';
import {
  formatSizePriceRange,
  productSizes,
  sizedName,
  sizeFieldLabel
} from '@/lib/product-sizes';
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
 * Every merchandising link is a real path, not a query string. Collections are
 * owner-managed rows, so "Plants" leads somewhere that can be curated, and
 * `usePathname` alone is enough to mark the current section without pulling
 * `useSearchParams` (and a Suspense boundary) into the root layout.
 *
 * These three slugs are locked in the content manager (see
 * `lib/collections.ts`) so the header can never point at a deleted collection.
 */
const navigation: ReadonlyArray<readonly [label: string, href: string]> = [
  ['Plants', '/collections/plants'],
  ['Teas & Herbals', '/collections/teas-herbals'],
  ['Botanicals', '/collections/botanicals'],
  ...(CLASSES_PUBLICLY_VISIBLE ? ([['Classes', '/classes']] as const) : []),
  ['Plant Care', '/care'],
  ['Gallery', '/gallery'],
  ['Our Picks', '/amazon']
];

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
};

function CartDrawerSuggestions() {
  const { items, addItem, closeCart } = useCart();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const slugs = items.map((item) => item.slug).join(',');

  useEffect(() => {
    if (!slugs) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/recommendations?exclude=${encodeURIComponent(slugs)}`, {
      signal: controller.signal
    })
      .then((response) => (response.ok ? response.json() : { products: [] }))
      .then((data: { products?: Suggestion[] }) => setSuggestions(data.products?.slice(0, 2) || []))
      .catch(() => setSuggestions([]));
    return () => controller.abort();
  }, [slugs]);

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
              <button className="btn small" type="button" onClick={() => addItem(product)}>
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
                      <Link href={`/shop/${item.slug}`} onClick={closeCart}>
                        <b>{item.name}</b>
                      </Link>
                      {/* Named on the line rather than folded into the title, so
                          two sizes of one plant read as the two lines they are. */}
                      {item.size && <span className="cart-line-size">{item.size}</span>}
                      <span>{formatMoney(item.priceCents)}</span>
                      <div className="cart-line-actions">
                        <div
                          className="quantity-picker small"
                          role="group"
                          aria-label={`Quantity for ${lineName(item)}`}
                        >
                          <button
                            type="button"
                            onClick={() => setQuantity(lineKey(item), item.quantity - 1)}
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
                            disabled={item.quantity >= item.inventory}
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
              {fulfillment !== 'PICKUP' && (
                <FreeShippingMeter subtotalCents={subtotalCents} threshold={freeShippingThreshold} />
              )}
              <div>
                <span>Subtotal</span>
                <strong>{formatMoney(subtotalCents)}</strong>
              </div>
              <p>
                {fulfillment === 'PICKUP'
                  ? 'No shipping charge. Tax is calculated securely in Stripe Checkout.'
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
              <button
                className="btn full"
                type="button"
                onClick={checkout}
                disabled={
                  checkoutLoading ||
                  cartFulfillment(items).conflict ||
                  (fulfillment === 'PICKUP' && !pickupArranged)
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
  freeShippingThreshold
}: {
  catalogEmpty?: boolean;
  freeShippingThreshold: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { count, drawerOpen, openCart, lastAdded } = useCart();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

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

    const focusTimer = window.requestAnimationFrame(() => {
      focusableElements(mobileMenuRef.current)[0]?.focus();
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
    const path = href.split('?')[0];
    if (path === '/') return pathname === '/';
    return pathname === path || pathname.startsWith(`${path}/`);
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
  catalogEmpty = false
}: {
  contactEmail?: string;
  catalogEmpty?: boolean;
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
          <NewsletterForm compact />
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
          {CLASSES_PUBLICLY_VISIBLE && (
            <p>
              <Link href="/classes">Classes</Link>
            </p>
          )}
          <p>
            <Link href="/care">Care sheets</Link>
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
