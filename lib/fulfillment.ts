export const GIFT_MESSAGE_MAX = 280;
export const PICKUP_ARRANGE_HREF = '/contact?subject=Local+pickup+inquiry';
export const PICKUP_ARRANGE_ERROR =
  'Contact us to arrange a pickup time before choosing local pickup at checkout.';

export type FulfillmentChoice = 'SHIP' | 'PICKUP';

export type FulfillmentFlags = {
  ships?: boolean | null;
  pickup?: boolean | null;
};

export type CartFulfillment = {
  canShip: boolean;
  canPickup: boolean;
  forced: FulfillmentChoice | null;
  conflict: boolean;
};

export function offersShipping(item: FulfillmentFlags) {
  return item.ships !== false;
}

export function offersPickup(item: FulfillmentFlags) {
  return item.pickup !== false;
}

export function cartFulfillment(items: FulfillmentFlags[]): CartFulfillment {
  if (!items.length) {
    return { canShip: true, canPickup: true, forced: null, conflict: false };
  }

  const canShip = items.every(offersShipping);
  const canPickup = items.every(offersPickup);
  const conflict = !canShip && !canPickup;
  let forced: FulfillmentChoice | null = null;
  if (canShip && !canPickup) forced = 'SHIP';
  if (canPickup && !canShip) forced = 'PICKUP';
  return { canShip, canPickup, forced, conflict };
}

export function resolveFulfillment(
  requested: FulfillmentChoice,
  options: CartFulfillment,
  arranged = false
): { ok: true; method: FulfillmentChoice } | { ok: false; error: string } {
  if (options.conflict) {
    return {
      ok: false,
      error:
        'This cart mixes pieces that only ship with pieces that are pickup only. Remove one group to continue.'
    };
  }
  const method = options.forced ?? requested;
  if (method === 'PICKUP' && !options.canPickup) {
    return {
      ok: false,
      error: 'Local pickup is not available for every item in this cart.'
    };
  }
  if (method === 'SHIP' && !options.canShip) {
    return {
      ok: false,
      error: 'These items are available for local pickup only.'
    };
  }
  if (method === 'PICKUP' && !arranged) {
    return { ok: false, error: PICKUP_ARRANGE_ERROR };
  }
  return { ok: true, method };
}

export function readFulfillmentChoice(body: unknown): FulfillmentChoice {
  if (!body || typeof body !== 'object') return 'SHIP';
  const raw = String((body as { fulfillment?: unknown }).fulfillment || '')
    .trim()
    .toUpperCase();
  return raw === 'PICKUP' ? 'PICKUP' : 'SHIP';
}

export function sanitizeGiftMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, GIFT_MESSAGE_MAX);
}

export function readGiftMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  return sanitizeGiftMessage((body as { giftMessage?: unknown }).giftMessage);
}

export function readPickupArranged(body: unknown) {
  if (!body || typeof body !== 'object') return false;
  return (body as { pickupArranged?: unknown }).pickupArranged === true;
}

export function shippingMethodLabel(method: FulfillmentChoice, shippingCents: number) {
  if (method === 'PICKUP') return 'Local pickup';
  return shippingCents === 0 ? 'Free standard shipping' : 'Standard shipping';
}

export function isPickupOrder(order: {
  fulfillmentMethod?: string | null;
  shippingMethod?: string | null;
}) {
  return order.fulfillmentMethod === 'PICKUP' || order.shippingMethod === 'Local pickup';
}

export function pickupPlaceholderAddress() {
  return {
    address1: 'Local pickup',
    address2: null as string | null,
    city: 'Ebensburg',
    state: 'PA',
    postalCode: '',
    country: 'US'
  };
}

/** Locality Stripe Tax should use for pickup — town ZIP, not a street address. */
export function pickupTaxOrigin() {
  const postalCode =
    (process.env.PICKUP_POSTAL_CODE || process.env.BUSINESS_POSTAL_CODE || '15931').trim() ||
    '15931';
  return {
    line1: 'Local pickup',
    city: 'Ebensburg',
    state: 'PA',
    postalCode,
    country: 'US'
  };
}

export function fulfillmentBlurb(product: FulfillmentFlags) {
  const ship = offersShipping(product);
  const pickup = offersPickup(product);
  if (ship && pickup) {
    return 'Ships to US addresses. Local pickup is available after you arrange a time with us.';
  }
  if (pickup) {
    return 'Local pickup only. Contact us to arrange a time, then choose pickup at checkout. Please do not come until we confirm it is ready.';
  }
  return 'Ships to US addresses.';
}

export function orderStatusHeading(order: {
  status: string;
  fulfillmentMethod?: string | null;
  shippingMethod?: string | null;
  fulfilledAt?: Date | string | null;
}) {
  const pickup = isPickupOrder(order);
  const alreadyFulfilled = Boolean(order.fulfilledAt);
  if (order.status === 'FULFILLED') {
    return pickup ? 'Your order is ready for pickup.' : 'Your order has shipped.';
  }
  if (order.status === 'PAID') {
    return pickup ? 'We are preparing your pickup.' : 'We are preparing your order.';
  }
  if (order.status === 'CANCELLED') return 'This order was cancelled.';
  if (order.status === 'REFUNDED') {
    if (alreadyFulfilled) {
      return pickup
        ? 'This pickup was completed. The order was later refunded.'
        : 'Your order shipped. It was later refunded.';
    }
    return 'This order was refunded.';
  }
  if (order.status === 'PARTIALLY_REFUNDED') {
    if (alreadyFulfilled) {
      return pickup
        ? 'This pickup was completed. Part of the order was refunded.'
        : 'Your order has shipped. Part of the order was refunded.';
    }
    return pickup
      ? 'Part of this pickup order was refunded. We are still preparing the rest.'
      : 'Part of this order was refunded. We are still preparing the rest.';
  }
  return `Order status: ${order.status.toLowerCase()}`;
}
