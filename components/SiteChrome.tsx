'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Menu, Minus, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import NewsletterForm from '@/components/NewsletterForm';
import ResilientImage from '@/components/ResilientImage';
import { useCart } from '@/components/CartProvider';
import { FALLBACK_PRODUCT_IMAGE, formatMoney } from '@/lib/store';

const navigation = [
  ['Plants', '/shop?category=PLANT'],
  ['Teas & Herbals', '/shop?category=TEA'],
  ['Botanicals', '/shop?category=SOAP'],
  ['Classes', '/classes'],
  ['Plant Care', '/care'],
  ['Gallery', '/gallery'],
  ['Our Picks', '/amazon']
] as const;

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function focusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  });
}

function CartDrawer() {
  const {
    items,
    subtotalCents,
    drawerOpen,
    checkoutLoading,
    closeCart,
    setQuantity,
    removeItem,
    checkout
  } = useCart();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusTimer = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCart();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusables = focusableElements(dialogRef.current);
      if (!focusables.length) {
        event.preventDefault();
        closeButtonRef.current?.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
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
      <aside
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
            <h3>Your cart is ready for something beautiful.</h3>
            <p>Browse plants, teas and small-batch botanical goods.</p>
            <Link className="btn" href="/shop" onClick={closeCart}>
              Explore the shop
            </Link>
          </div>
        ) : (
          <>
            <div className="cart-lines">
              {items.map((item) => (
                <div className="cart-line" key={item.slug}>
                  <ResilientImage
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
                    <span>{formatMoney(item.priceCents)}</span>
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
                      <button
                        className="text-button danger"
                        type="button"
                        onClick={() => removeItem(item.slug)}
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    </div>
                  </div>
                  <b>{formatMoney(item.priceCents * item.quantity)}</b>
                </div>
              ))}
            </div>
            <div className="drawer-total">
              <div>
                <span>Subtotal</span>
                <strong>{formatMoney(subtotalCents)}</strong>
              </div>
              <p>Shipping and any applicable tax are calculated securely in Stripe Checkout.</p>
              <button
                className="btn full"
                type="button"
                onClick={checkout}
                disabled={checkoutLoading}
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
      </aside>
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { count, drawerOpen, openCart } = useCart();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMobileOpen(false), [pathname]);

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
      const menuLinks = focusableElements(mobileMenuRef.current);
      const focusables = [menuButtonRef.current, ...menuLinks].filter(
        (element): element is HTMLElement => Boolean(element)
      );
      if (!focusables.length) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
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

  const isActive = (href: string) => !href.includes('?') && pathname === href;

  const openMobileCart = () => {
    setMobileOpen(false);
    openCart();
  };

  return (
    <>
      <div className="topbar editorial-topbar">
        <span>❧ &nbsp; Free shipping on orders $75+</span>
        <div>
          <Link href="/about">About Us</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/care">Plant Care</Link>
        </div>
      </div>

      <header className="editorial-header">
        <div className="container editorial-head-main">
          <Link className="header-search" href="/shop" aria-label="Search The Hillside Gardens shop">
            <Search size={22} />
            <span>Search our shop</span>
          </Link>

          <Link href="/" className="brand editorial-brand" aria-label="The Hillside Gardens home">
            <img src="/logo.png" alt="The Hillside Gardens" width="949" height="917" />
          </Link>

          <div className="header-actions">
            <Link href="/order-status">Orders</Link>
            <button
              className="editorial-cart"
              type="button"
              onClick={openCart}
              aria-label={`Open cart with ${count} items`}
            >
              <ShoppingBag size={22} />
              <span>Cart ({count})</span>
            </button>
          </div>

          <div className="mobile-header-actions">
            <button
              className="icon-button mobile-cart-button"
              type="button"
              onClick={openMobileCart}
              aria-label={`Open cart with ${count} items`}
            >
              <ShoppingBag size={20} />
              <span className="mobile-cart-count" aria-hidden="true">{count}</span>
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
            <Link className="sale-link" href="/shop" aria-current={pathname === '/shop' ? 'page' : undefined}>
              New Arrivals
            </Link>
          </div>

          {mobileOpen && (
            <div className="mobile-menu container" id="mobile-primary-menu" ref={mobileMenuRef}>
              {navigation.map(([label, href]) => (
                <Link href={href} key={href} aria-current={isActive(href) ? 'page' : undefined}>
                  {label}
                </Link>
              ))}
              <Link href="/shop" aria-current={pathname === '/shop' ? 'page' : undefined}>New Arrivals</Link>
              <Link href="/order-status" aria-current={pathname === '/order-status' ? 'page' : undefined}>Order Status</Link>
              <Link href="/about" aria-current={pathname === '/about' ? 'page' : undefined}>About Us</Link>
              <Link href="/contact" aria-current={pathname === '/contact' ? 'page' : undefined}>Contact</Link>
            </div>
          )}
        </nav>
      </header>

      {mobileOpen && (
        <button
          className="mobile-menu-page-backdrop"
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileOpen(false)}
          tabIndex={-1}
        />
      )}

      <CartDrawer />
    </>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  const showNewsletter = pathname !== '/';

  return (
    <footer className={`footer${showNewsletter ? '' : ' footer-without-newsletter'}`}>
      {showNewsletter && (
        <div className="container footer-newsletter">
          <div>
            <div className="eyebrow">The Hillside Notes</div>
            <h3>Seasonal tips, class dates and new arrivals.</h3>
          </div>
          <NewsletterForm compact />
        </div>
      )}
      <div className="container footergrid">
        <div className="footer-brand">
          <img src="/logo.png" alt="The Hillside Gardens" width="949" height="917" />
          <p>
            Plants, teas and botanicals chosen with care, plus approachable education to help you grow
            with confidence.
          </p>
          <a href="mailto:hello@thehillsidegardens.com">hello@thehillsidegardens.com</a>
        </div>
        <div>
          <h4>Explore</h4>
          <p><Link href="/shop">Shop</Link></p>
          <p><Link href="/classes">Classes</Link></p>
          <p><Link href="/care">Care sheets</Link></p>
          <p><Link href="/gallery">Gallery</Link></p>
        </div>
        <div>
          <h4>Customer care</h4>
          <p><Link href="/order-status">Order status</Link></p>
          <p><Link href="/shipping-returns">Shipping & returns</Link></p>
          <p><Link href="/faq">Frequently asked questions</Link></p>
          <p><Link href="/contact">Contact us</Link></p>
        </div>
        <div>
          <h4>Information</h4>
          <p><Link href="/about">About us</Link></p>
          <p><Link href="/amazon">Our Amazon picks</Link></p>
          <p><Link href="/privacy">Privacy</Link></p>
          <p><Link href="/terms">Terms</Link></p>
          <p><Link href="/admin">Owner admin</Link></p>
        </div>
      </div>
      <div className="container footer-bottom">
        <small>© {new Date().getFullYear()} The Hillside Gardens. All rights reserved.</small>
        <small>Plants • Teas • Botanicals</small>
      </div>
    </footer>
  );
}
