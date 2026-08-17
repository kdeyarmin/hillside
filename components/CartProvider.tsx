'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { toGtagItem, trackAddToCart, trackBeginCheckout } from '@/lib/analytics';
import { clampQuantity } from '@/lib/store';
import { checkoutAdjustmentNotice } from '@/lib/checkout-format';

export type CartProduct = {
  slug: string;
  name: string;
  priceCents: number;
  imageUrl: string | null;
  inventory: number;
  type?: string;
};

export type CartLine = CartProduct & { quantity: number };

export type CheckoutAdjustment = {
  slug: string;
  name: string;
  requested: number;
  available: number;
  reason?: 'stock' | 'price' | 'unavailable';
  priceCents?: number;
};

type CartContextValue = {
  items: CartLine[];
  count: number;
  subtotalCents: number;
  drawerOpen: boolean;
  checkoutLoading: boolean;
  checkoutError: string | null;
  checkoutNotice: string | null;
  lastAdded: string | null;
  addItem: (product: CartProduct, quantity?: number) => void;
  setQuantity: (slug: string, quantity: number) => void;
  removeItem: (slug: string) => void;
  replaceItems: (lines: CartLine[]) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  checkout: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = 'hillside-cart-v2';

function noticeForAdjustment(change: CheckoutAdjustment) {
  return checkoutAdjustmentNotice(change);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [items, setItems] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const checkoutLock = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as unknown;
      if (Array.isArray(saved)) {
        const lines = saved.flatMap((entry): CartLine[] => {
          if (!entry || typeof entry !== 'object') return [];
          const line = entry as Partial<CartLine>;
          if (!line.slug || !line.name || !Number.isFinite(line.priceCents)) return [];
          const inventory = Math.max(1, Number(line.inventory) || 1);
          return [
            {
              slug: String(line.slug),
              name: String(line.name),
              priceCents: Number(line.priceCents),
              imageUrl: line.imageUrl ? String(line.imageUrl) : null,
              inventory,
              type: line.type ? String(line.type) : undefined,
              quantity: clampQuantity(Number(line.quantity) || 1, inventory)
            }
          ];
        });
        setItems(lines);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  const addItem = useCallback((product: CartProduct, quantity = 1) => {
    trackAddToCart(toGtagItem(product, quantity));
    setLastAdded(`${product.name} added to your basket.`);
    setItems((current) => {
      const existing = current.find((item) => item.slug === product.slug);
      if (existing) {
        return current.map((item) =>
          item.slug === product.slug
            ? {
                ...item,
                ...product,
                quantity: clampQuantity(item.quantity + quantity, product.inventory)
              }
            : item
        );
      }
      return [
        ...current,
        {
          ...product,
          quantity: clampQuantity(quantity, product.inventory)
        }
      ];
    });
  }, []);

  const setQuantity = useCallback((slug: string, quantity: number) => {
    setItems((current) =>
      current.flatMap((item) => {
        if (item.slug !== slug) return [item];
        if (quantity <= 0) return [];
        return [{ ...item, quantity: clampQuantity(quantity, item.inventory) }];
      })
    );
  }, []);

  const removeItem = useCallback((slug: string) => {
    setItems((current) => current.filter((item) => item.slug !== slug));
  }, []);

  const replaceItems = useCallback((lines: CartLine[]) => {
    setItems(lines);
  }, []);

  const clearCart = useCallback(() => setItems([]), []);
  const openCart = useCallback(() => setDrawerOpen(true), []);
  const closeCart = useCallback(() => setDrawerOpen(false), []);

  const checkout = useCallback(async () => {
    if (!items.length || checkoutLock.current) return;
    checkoutLock.current = true;
    setCheckoutLoading(true);
    setCheckoutError(null);
    setCheckoutNotice(null);
    trackBeginCheckout(
      items.map((item) => toGtagItem(item, item.quantity)),
      items.reduce((total, item) => total + item.priceCents * item.quantity, 0)
    );
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((item) => ({
            id: item.slug,
            quantity: item.quantity,
            priceCents: item.priceCents
          }))
        })
      });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
        adjustments?: CheckoutAdjustment[];
      };

      if (result.adjustments?.length) {
        const adjustments = result.adjustments;
        setItems((current) =>
          current.flatMap((item) => {
            const change = adjustments.find((entry) => entry.slug === item.slug);
            if (!change) return [item];
            if (change.reason === 'price' && change.priceCents != null) {
              return [{ ...item, priceCents: change.priceCents }];
            }
            if (change.available <= 0) return [];
            return [{ ...item, inventory: change.available, quantity: change.available }];
          })
        );
        setCheckoutNotice(adjustments.map(noticeForAdjustment).join(' '));
        checkoutLock.current = false;
        setCheckoutLoading(false);
        return;
      }

      if (!response.ok || !result.url) throw new Error(result.error || 'Unable to open checkout.');
      window.location.assign(result.url);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Unable to open checkout.');
      checkoutLock.current = false;
      setCheckoutLoading(false);
    }
  }, [items]);

  const count = useMemo(() => items.reduce((total, item) => total + item.quantity, 0), [items]);
  const subtotalCents = useMemo(
    () => items.reduce((total, item) => total + item.priceCents * item.quantity, 0),
    [items]
  );

  const value = useMemo(
    () => ({
      items,
      count,
      subtotalCents,
      drawerOpen,
      checkoutLoading,
      checkoutError,
      checkoutNotice,
      lastAdded,
      addItem,
      setQuantity,
      removeItem,
      replaceItems,
      clearCart,
      openCart,
      closeCart,
      checkout
    }),
    [
      items,
      count,
      subtotalCents,
      drawerOpen,
      checkoutLoading,
      checkoutError,
      checkoutNotice,
      lastAdded,
      addItem,
      setQuantity,
      removeItem,
      replaceItems,
      clearCart,
      openCart,
      closeCart,
      checkout
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
}
