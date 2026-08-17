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
import { checkoutAdjustmentNotice } from '@/lib/checkout-format';
import {
  cartFulfillment,
  GIFT_MESSAGE_MAX,
  readFulfillmentChoice,
  resolveFulfillment,
  sanitizeGiftMessage,
  type FulfillmentChoice
} from '@/lib/fulfillment';
import { clampQuantity } from '@/lib/store';

export type CartProduct = {
  slug: string;
  name: string;
  priceCents: number;
  imageUrl: string | null;
  inventory: number;
  type?: string;
  ships?: boolean;
  pickup?: boolean;
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
  fulfillment: FulfillmentChoice;
  giftMessage: string;
  pickupArranged: boolean;
  addItem: (product: CartProduct, quantity?: number) => void;
  setQuantity: (slug: string, quantity: number) => void;
  removeItem: (slug: string) => void;
  replaceItems: (lines: CartLine[]) => void;
  clearCart: () => void;
  setFulfillment: (method: FulfillmentChoice) => void;
  setGiftMessage: (value: string) => void;
  setPickupArranged: (value: boolean) => void;
  openCart: () => void;
  closeCart: () => void;
  checkout: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = 'hillside-cart-v2';
const PREFS_KEY = 'hillside-checkout-prefs-v1';

function readStoredPrefs(): { fulfillment: FulfillmentChoice; giftMessage: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as unknown;
    if (!saved || typeof saved !== 'object') return { fulfillment: 'SHIP', giftMessage: '' };
    const raw = saved as { fulfillment?: unknown; giftMessage?: unknown };
    return {
      fulfillment: readFulfillmentChoice({ fulfillment: raw.fulfillment }),
      giftMessage: sanitizeGiftMessage(raw.giftMessage) || ''
    };
  } catch {
    return { fulfillment: 'SHIP', giftMessage: '' };
  }
}

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
  const [fulfillment, setFulfillmentState] = useState<FulfillmentChoice>('SHIP');
  const [giftMessage, setGiftMessageState] = useState('');
  const [pickupArranged, setPickupArranged] = useState(false);
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
              ships: line.ships !== false,
              pickup: line.pickup !== false,
              quantity: clampQuantity(Number(line.quantity) || 1, inventory)
            }
          ];
        });
        setItems(lines);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      const prefs = readStoredPrefs();
      setFulfillmentState(prefs.fulfillment);
      setGiftMessageState(prefs.giftMessage);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(PREFS_KEY, JSON.stringify({ fulfillment, giftMessage }));
  }, [fulfillment, giftMessage, ready]);

  useEffect(() => {
    const options = cartFulfillment(items);
    if (options.forced && options.forced !== fulfillment) {
      setFulfillmentState(options.forced);
    }
  }, [fulfillment, items]);

  const setFulfillment = useCallback(
    (method: FulfillmentChoice) => {
      const options = cartFulfillment(items);
      if (options.forced) {
        setFulfillmentState(options.forced);
        return;
      }
      if (method === 'PICKUP' && !options.canPickup) return;
      if (method === 'SHIP' && !options.canShip) return;
      setFulfillmentState(method);
    },
    [items]
  );

  const setGiftMessage = useCallback((value: string) => {
    setGiftMessageState(value.slice(0, GIFT_MESSAGE_MAX));
  }, []);

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

  const clearCart = useCallback(() => {
    setItems([]);
    setGiftMessageState('');
    setPickupArranged(false);
  }, []);
  const openCart = useCallback(() => setDrawerOpen(true), []);
  const closeCart = useCallback(() => setDrawerOpen(false), []);

  const checkout = useCallback(async () => {
    if (!items.length || checkoutLock.current) return;
    const options = cartFulfillment(items);
    const resolved = resolveFulfillment(fulfillment, options, pickupArranged);
    if (!resolved.ok) {
      setCheckoutError(resolved.error);
      return;
    }
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
          fulfillment: resolved.method,
          pickupArranged,
          giftMessage,
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
  }, [fulfillment, giftMessage, items, pickupArranged]);

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
      fulfillment,
      giftMessage,
      pickupArranged,
      addItem,
      setQuantity,
      removeItem,
      replaceItems,
      clearCart,
      setFulfillment,
      setGiftMessage,
      setPickupArranged,
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
      fulfillment,
      giftMessage,
      pickupArranged,
      addItem,
      setQuantity,
      removeItem,
      replaceItems,
      clearCart,
      setFulfillment,
      setGiftMessage,
      setPickupArranged,
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
