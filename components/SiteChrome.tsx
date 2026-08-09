'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import NewsletterForm from '@/components/NewsletterForm';
import { useCart } from '@/components/CartProvider';
import { FALLBACK_PRODUCT_IMAGE, formatMoney } from '@/lib/store';

const navigation = [
  ['Shop', '/shop'],
  ['Classes', '/classes'],
  ['Plant Care', '/care'],
  ['Gallery', '/gallery'],
  ['Tammy’s Picks', '/amazon'],
  ['Our Story', '/about'],
  ['Contact', '/contact']
] as const;

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

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  if (!drawerOpen) return null;

  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label="Shopping cart">
      <button className="drawer-backdrop" type="button" onClick={closeCart} aria-label="Close cart" />
      <aside className="cart-drawer">
        <div className="drawer-heading">
          <div>
            <span className="eyebrow">Your basket</span>
            <h2>Shopping cart</h2>
          </div>
          <button className="icon-button" type="button" onClick={closeCart} aria-label="Close cart">
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
                  <img src={item.imageUrl || FALLBACK_PRODUCT_IMAGE} alt={item.name} />
                  <div className="cart-line-copy">
                    <Link href={`/shop/${item.slug}`} onClick={closeCart}>
                      <b>{item.name}</b>
                    </Link>
                    <span>{formatMoney(item.priceCents)}</span>
                    <div className="cart-line-actions">
                      <div className="quantity-picker small" aria-label={`Quantity for ${item.name}`}>
                        <button
                          type="button"
                          onClick={() => setQuantity(item.slug, item.quantity - 1)}
                          aria-label="Decrease quantity"
                        >
                          <Minus size={14} />
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => setQuantity(item.slug, item.quantity + 1)}
                          disabled={item.quantity >= item.inventory}
                          aria-label="Increase quantity"
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
              <button className="btn full" type="button" onClick={checkout} disabled={checkoutLoading}>
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
  const { count, openCart } = useCart();

  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <>
      <div className="topbar">Small-batch botanicals • Plant workshops • Thoughtful gifts</div>
      <nav className="nav" aria-label="Primary navigation">
        <div className="container navin">
          <button
            className="icon-button mobile-menu-button"
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            aria-expanded={mobileOpen}
            aria-label="Open navigation menu"
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
          <Link href="/" className="brand" aria-label="The Hillside Gardens home">
            <img src="/logo.svg" alt="The Hillside Gardens" />
          </Link>
          <div className="links">
            {navigation.map(([label, href]) => (
              <Link className={pathname === href ? 'active' : ''} href={href} key={href}>
                {label}
              </Link>
            ))}
          </div>
          <button className="site-cart" type="button" onClick={openCart} aria-label={`Open cart with ${count} items`}>
            <ShoppingBag size={20} />
            <span>Cart</span>
            {count > 0 && <b>{count}</b>}
          </button>
        </div>
        {mobileOpen && (
          <div className="mobile-menu container">
            {navigation.map(([label, href]) => (
              <Link href={href} key={href}>
                {label}
              </Link>
            ))}
            <Link className="btn" href="/shop">
              Shop now
            </Link>
          </div>
        )}
      </nav>
      <CartDrawer />
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container footer-newsletter">
        <div>
          <div className="eyebrow">The Hillside Notes</div>
          <h3>Seasonal tips, class dates and new arrivals.</h3>
        </div>
        <NewsletterForm compact />
      </div>
      <div className="container footergrid">
        <div className="footer-brand">
          <img src="/logo.svg" alt="The Hillside Gardens" />
          <p>
            Plants, teas and botanicals chosen with care, plus approachable education to help you grow
            with confidence.
          </p>
          <a href="mailto:hello@thehillsidegarden.com">hello@thehillsidegarden.com</a>
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
          <p><Link href="/contact">Contact Tammy</Link></p>
        </div>
        <div>
          <h4>Information</h4>
          <p><Link href="/about">About Tammy</Link></p>
          <p><Link href="/amazon">Tammy’s Amazon picks</Link></p>
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
