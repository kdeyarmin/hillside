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
import { basketLineKey, readLineKind, type LineKind } from '@/lib/cart-lines';
import { CODE_INPUT_MAX } from '@/lib/discount-request';
import { normalizeSizeLabel } from '@/lib/product-sizes';
import { clampQuantity } from '@/lib/store';

export type CartProduct = {
  slug: string;
  name: string;
  priceCents: number;
  imageUrl: string | null;
  /**
   * The ceiling on this line. For a set that is how many complete sets the
   * bench can build, worked out from the components — a bundle has no count of
   * its own, and the drawer must not let a shopper climb past what exists.
   */
  inventory: number;
  type?: string;
  ships?: boolean;
  pickup?: boolean;
  /** The size the shopper chose, for products sold in more than one size. */
  size?: string | null;
  /** `bundle` for a set. Absent means an ordinary product. */
  kind?: LineKind;
  /** "Hillside Calm Tea × 1 · Stainless infuser × 1", shown under a set's line. */
  contents?: string | null;
};

export type CartLine = CartProduct & { quantity: number };

export type CheckoutAdjustment = {
  slug: string;
  kind?: LineKind;
  name: string;
  requested: number;
  available: number;
  reason?: 'stock' | 'price' | 'unavailable' | 'size';
  priceCents?: number;
  size?: string | null;
};

/** Which of the two code boxes a message or an action is about. */
export type DiscountField = 'promoCode' | 'giftCardCode';

/**
 * What the shop says this basket is worth with the customer's codes on it.
 * Priced by the server and never in the browser: the cart may show a figure,
 * but it may not decide one.
 */
export type DiscountSummary = {
  subtotalCents: number;
  shippingCents: number;
  promoDiscountCents: number;
  giftCardCents: number;
  discountCents: number;
  totalCents: number;
  freeShipping: boolean;
  pickup: boolean;
  promotion: { code: string; summary: string } | null;
  /** Masked, never the full number: see `DiscountQuoteResult` for why. */
  giftCard: { maskedCode: string; balanceCents: number } | null;
  promotionError: string | null;
  giftCardError: string | null;
};

type DiscountMessages = Partial<Record<DiscountField, string>>;

/**
 * A basket line is a kind, a slug *and* a size, so every operation below
 * addresses lines by this key rather than by the slug. Keyed on the slug alone,
 * adding a 6" pot of a plant already in the basket in 4" would have silently
 * changed the size of the line that was there — and a set could have collided
 * with a product that happened to share its slug.
 */
export function lineKey(line: { slug: string; size?: string | null; kind?: LineKind }) {
  return basketLineKey(line.kind || 'product', line.slug, line.size);
}

/**
 * Folds lines that address the same product and size into one. Normalizing a
 * stored size is not enough on its own: two saved entries can normalize onto the
 * same key, and duplicate keys mean a duplicate React key and a Remove that
 * takes a line the shopper did not point at.
 */
function mergeByLine(lines: CartLine[]) {
  const merged = new Map<string, CartLine>();
  for (const line of lines) {
    const key = lineKey(line);
    const existing = merged.get(key);
    merged.set(
      key,
      existing
        ? {
            ...existing,
            quantity: clampQuantity(existing.quantity + line.quantity, line.inventory)
          }
        : line
    );
  }
  return [...merged.values()];
}

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
  /** The codes currently applied, and what the shop says they are worth. */
  appliedCodes: Record<DiscountField, string>;
  discount: DiscountSummary | null;
  discountPending: DiscountField | null;
  discountErrors: DiscountMessages;
  applyDiscountCode: (field: DiscountField, code: string) => Promise<void>;
  removeDiscountCode: (field: DiscountField) => void;
  addItem: (product: CartProduct, quantity?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
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

const NO_CODES: Record<DiscountField, string> = { promoCode: '', giftCardCode: '' };

function readStoredCode(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, CODE_INPUT_MAX) : '';
}

function readStoredPrefs(): {
  fulfillment: FulfillmentChoice;
  giftMessage: string;
  codes: Record<DiscountField, string>;
} {
  const empty = { fulfillment: 'SHIP' as FulfillmentChoice, giftMessage: '', codes: NO_CODES };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as unknown;
    if (!saved || typeof saved !== 'object') return empty;
    const raw = saved as {
      fulfillment?: unknown;
      giftMessage?: unknown;
      promoCode?: unknown;
      giftCardCode?: unknown;
    };
    return {
      fulfillment: readFulfillmentChoice({ fulfillment: raw.fulfillment }),
      giftMessage: sanitizeGiftMessage(raw.giftMessage) || '',
      /**
       * The codes are remembered, but nothing they were worth is: the basket
       * may have changed, the code may have run out, and a discount restored
       * from storage would be a figure this browser made up. They are priced
       * again by the server on the next render that has a basket to price.
       */
      codes: {
        promoCode: readStoredCode(raw.promoCode),
        giftCardCode: readStoredCode(raw.giftCardCode)
      }
    };
  } catch {
    return empty;
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
  const [appliedCodes, setAppliedCodes] = useState<Record<DiscountField, string>>(NO_CODES);
  const [discount, setDiscount] = useState<DiscountSummary | null>(null);
  const [discountPending, setDiscountPending] = useState<DiscountField | null>(null);
  const [discountErrors, setDiscountErrors] = useState<DiscountMessages>({});
  const checkoutLock = useRef(false);
  /** Cancels a quote still in flight when a newer one supersedes it. */
  const quoteRequest = useRef<AbortController | null>(null);

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
              /**
               * Normalized on the way in, because `lineKey` normalizes: a stored
               * size that differs only in spacing would otherwise be a separate
               * line carrying the same key, and Remove would take both. Baskets
               * saved before sizes existed have none and read back as the
               * one-size lines they were.
               */
              size: normalizeSizeLabel(line.size) || null,
              kind: readLineKind(line.kind),
              contents: line.contents ? String(line.contents) : null,
              quantity: clampQuantity(Number(line.quantity) || 1, inventory)
            }
          ];
        });
        setItems(mergeByLine(lines));
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      const prefs = readStoredPrefs();
      setFulfillmentState(prefs.fulfillment);
      setGiftMessageState(prefs.giftMessage);
      setAppliedCodes(prefs.codes);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(PREFS_KEY, JSON.stringify({ fulfillment, giftMessage, ...appliedCodes }));
  }, [appliedCodes, fulfillment, giftMessage, ready]);

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

  /**
   * Prices the basket against a set of codes and keeps whichever of them the
   * shop accepted.
   *
   * Every figure in the answer comes from the server. The cart never works a
   * discount out for itself, because the only discount that matters is the one
   * the checkout route will hold and Stripe will charge, and a cart that did
   * its own arithmetic would eventually disagree with both.
   */
  const requestQuote = useCallback(
    async (codes: Record<DiscountField, string>, pending: DiscountField | null = null) => {
      quoteRequest.current?.abort();
      if ((!codes.promoCode && !codes.giftCardCode) || !items.length) {
        quoteRequest.current = null;
        setDiscount(null);
        // Whatever was in flight has just been abandoned, and an abandoned
        // request never reaches the line below that clears this. Without it a
        // code removed mid-check leaves the other box reading "Checking…".
        setDiscountPending(null);
        return;
      }

      const controller = new AbortController();
      quoteRequest.current = controller;
      setDiscountPending(pending);
      try {
        const response = await fetch('/api/discounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            fulfillment,
            promoCode: codes.promoCode,
            giftCardCode: codes.giftCardCode,
            // The same lines checkout sends, sets included: a quote priced
            // against a different basket than the one being bought is worse
            // than no quote.
            items: items.map((item) => ({
              id: item.slug,
              quantity: item.quantity,
              ...(item.kind === 'bundle' ? { kind: 'bundle' } : {}),
              ...(item.size ? { size: item.size } : {})
            }))
          })
        });
        const result = (await response.json()) as Partial<DiscountSummary> & { error?: string };
        if (!response.ok) {
          throw new Error(result.error || 'We could not check that code just now.');
        }

        const summary = result as DiscountSummary;
        setDiscount(summary);
        /**
         * A code the shop refused is dropped rather than left sitting in the
         * box looking applied; the message below says why. The same object is
         * handed back when nothing changed, because the effect that re-prices a
         * changed basket watches this state — a fresh object every time would
         * have it re-price its own answer, for ever.
         */
        setAppliedCodes((current) => {
          const next = {
            promoCode: summary.promotion ? codes.promoCode : '',
            giftCardCode: summary.giftCard ? codes.giftCardCode : ''
          };
          return next.promoCode === current.promoCode && next.giftCardCode === current.giftCardCode
            ? current
            : next;
        });
        setDiscountErrors({
          ...(summary.promotionError ? { promoCode: summary.promotionError } : {}),
          ...(summary.giftCardError ? { giftCardCode: summary.giftCardError } : {})
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        /**
         * The codes are deliberately left applied. A quote that could not be
         * fetched says nothing about whether the code is good, and checkout
         * prices them again for itself — so dropping them here would lose a
         * working discount to one failed request.
         */
        const message =
          error instanceof Error ? error.message : 'We could not check that code just now.';
        setDiscount(null);
        setDiscountErrors(pending ? { [pending]: message } : { promoCode: message });
      } finally {
        if (!controller.signal.aborted) setDiscountPending(null);
      }
    },
    [fulfillment, items]
  );

  const applyDiscountCode = useCallback(
    async (field: DiscountField, code: string) => {
      const typed = code.trim().slice(0, CODE_INPUT_MAX);
      if (!typed) return;
      setDiscountErrors((current) => ({ ...current, [field]: undefined }));
      await requestQuote({ ...appliedCodes, [field]: typed }, field);
    },
    [appliedCodes, requestQuote]
  );

  const removeDiscountCode = useCallback(
    (field: DiscountField) => {
      const next = { ...appliedCodes, [field]: '' };
      setAppliedCodes(next);
      setDiscountErrors((current) => ({ ...current, [field]: undefined }));
      void requestQuote(next);
    },
    [appliedCodes, requestQuote]
  );

  /**
   * A basket that changes after a code was applied has to be priced again — a
   * code with a minimum stops applying when a line is removed, and a
   * percentage is worth something different on every basket. Debounced because
   * the obvious trigger for this is somebody holding down the quantity button.
   */
  useEffect(() => {
    if (!ready) return;
    if (!appliedCodes.promoCode && !appliedCodes.giftCardCode) return;
    const timer = setTimeout(() => void requestQuote(appliedCodes), 400);
    return () => clearTimeout(timer);
    // `requestQuote` closes over the basket and the fulfillment choice, which is
    // exactly what should re-run this, so it is the only dependency needed
    // besides the codes themselves.
  }, [appliedCodes, ready, requestQuote]);

  const addItem = useCallback((product: CartProduct, quantity = 1) => {
    trackAddToCart(toGtagItem(product, quantity));
    setLastAdded(
      product.size
        ? `${product.name} (${product.size}) added to your basket.`
        : product.kind === 'bundle'
          ? `The ${product.name} set was added to your basket.`
          : `${product.name} added to your basket.`
    );
    setItems((current) => {
      const key = lineKey(product);
      const existing = current.find((item) => lineKey(item) === key);
      if (existing) {
        return current.map((item) =>
          lineKey(item) === key
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

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((current) =>
      current.flatMap((item) => {
        if (lineKey(item) !== key) return [item];
        if (quantity <= 0) return [];
        return [{ ...item, quantity: clampQuantity(quantity, item.inventory) }];
      })
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((current) => current.filter((item) => lineKey(item) !== key));
  }, []);

  const replaceItems = useCallback((lines: CartLine[]) => {
    setItems(lines);
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setGiftMessageState('');
    setPickupArranged(false);
    setAppliedCodes(NO_CODES);
    setDiscount(null);
    setDiscountErrors({});
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
          promoCode: appliedCodes.promoCode,
          giftCardCode: appliedCodes.giftCardCode,
          items: items.map((item) => ({
            id: item.slug,
            quantity: item.quantity,
            priceCents: item.priceCents,
            ...(item.kind === 'bundle' ? { kind: 'bundle' } : {}),
            ...(item.size ? { size: item.size } : {})
          }))
        })
      });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
        adjustments?: CheckoutAdjustment[];
        discountErrors?: DiscountMessages;
      };

      /**
       * A code that stopped working between applying it and pressing the button
       * — it ran out, it expired, the basket fell under its minimum. Checkout
       * refuses rather than quietly charging the undiscounted total, so the code
       * comes off here and the customer sees why before trying again.
       */
      if (result.discountErrors) {
        const failed = result.discountErrors;
        setAppliedCodes((current) => ({
          promoCode: failed.promoCode ? '' : current.promoCode,
          giftCardCode: failed.giftCardCode ? '' : current.giftCardCode
        }));
        setDiscountErrors(failed);
        setDiscount(null);
        checkoutLock.current = false;
        setCheckoutLoading(false);
        return;
      }

      if (result.adjustments?.length) {
        const adjustments = result.adjustments;
        setItems((current) =>
          current.flatMap((item) => {
            const change = adjustments.find((entry) => lineKey(entry) === lineKey(item));
            if (!change) return [item];
            if (change.reason === 'price' && change.priceCents != null) {
              return [{ ...item, priceCents: change.priceCents }];
            }
            // A size we no longer sell cannot be corrected for the shopper —
            // the line goes, and the notice sends them back to the dropdown.
            if (change.reason === 'size' || change.available <= 0) return [];
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
  }, [appliedCodes, fulfillment, giftMessage, items, pickupArranged]);

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
      appliedCodes,
      discount,
      discountPending,
      discountErrors,
      applyDiscountCode,
      removeDiscountCode,
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
      appliedCodes,
      discount,
      discountPending,
      discountErrors,
      applyDiscountCode,
      removeDiscountCode,
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
