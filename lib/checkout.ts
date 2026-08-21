import { db } from '@/lib/db';
import { notifyStockAlerts } from '@/lib/stock-alerts';
import {
  CHECKOUT_HOLD_MINUTES,
  holdExpiry,
  InsufficientStockError,
  type CheckoutLine
} from '@/lib/checkout-format';
import { shippingMethodLabel, type FulfillmentChoice } from '@/lib/fulfillment';

export {
  CHECKOUT_HOLD_MINUTES,
  InsufficientStockError,
  holdExpiry,
  holdExpiryUnix,
  stripeProductDescription,
  stripeProductImages,
  readCheckoutItems,
  checkoutAdjustments,
  encodeCheckoutItems,
  parseCheckoutItems
} from '@/lib/checkout-format';

export type {
  CheckoutRequestedItem,
  CheckoutAdjustment,
  CheckoutLine,
  ParsedCheckoutItem
} from '@/lib/checkout-format';

export async function reserveProductOrder({
  invoiceNumber,
  items,
  subtotalCents,
  shippingCents,
  fulfillmentMethod,
  giftMessage
}: {
  invoiceNumber: string;
  items: CheckoutLine[];
  subtotalCents: number;
  shippingCents: number;
  fulfillmentMethod: FulfillmentChoice;
  giftMessage?: string | null;
}) {
  const expiresAt = holdExpiry();
  const holdId = `hold_${crypto.randomUUID()}`;

  const order = await db.$transaction(async (transaction) => {
    for (const item of items) {
      const result = await transaction.product.updateMany({
        where: { id: item.product.id, active: true, inventory: { gte: item.quantity } },
        data: { inventory: { decrement: item.quantity } }
      });
      if (result.count === 0) {
        throw new InsufficientStockError(item.product.slug, item.size || null);
      }
    }

    return transaction.order.create({
      data: {
        invoiceNumber,
        stripeSessionId: holdId,
        status: 'PENDING',
        customerName: 'Checkout in progress',
        email: '',
        address1: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'US',
        subtotalCents,
        shippingCents,
        taxCents: 0,
        totalCents: subtotalCents + shippingCents,
        fulfillmentMethod,
        giftMessage: giftMessage || null,
        shippingMethod: shippingMethodLabel(fulfillmentMethod, shippingCents),
        items: {
          create: items.map((item) => ({
            productId: item.product.id,
            name: item.product.name,
            size: item.size || null,
            quantity: item.quantity,
            unitCents: item.unitCents
          }))
        }
      }
    });
  });

  return { order, holdId, expiresAt };
}

export async function attachStripeSessionToOrder(holdId: string, stripeSessionId: string) {
  await db.order.update({
    where: { stripeSessionId: holdId },
    data: { stripeSessionId }
  });
}

export async function releaseProductHold(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: { select: { name: true, slug: true, inventory: true } } } }
    }
  });
  if (!order || order.status !== 'PENDING') return false;

  const restocked: Array<{ id: string; name: string; slug: string }> = [];

  await db.$transaction(async (transaction) => {
    const claimed = await transaction.order.updateMany({
      where: { id: order.id, status: 'PENDING' },
      data: { status: 'CANCELLED', inventoryRestoredAt: new Date() }
    });
    if (claimed.count === 0) return;

    for (const item of order.items) {
      const previousInventory = item.product.inventory;
      await transaction.product.update({
        where: { id: item.productId },
        data: { inventory: { increment: item.quantity } }
      });
      if (previousInventory <= 0) {
        restocked.push({ id: item.productId, name: item.product.name, slug: item.product.slug });
      }
    }
  });

  for (const product of restocked) {
    await notifyStockAlerts(product.id, product.name, product.slug);
  }

  return true;
}

/**
 * Abandoned checkouts whose Stripe session never expired into the webhook —
 * a missed event, a webhook that was not subscribed yet — would otherwise
 * leave reserved stock invisible until someone noticed.
 */
export async function releaseExpiredProductHolds() {
  const cutoff = new Date(Date.now() - CHECKOUT_HOLD_MINUTES * 60_000);
  const stale = await db.order.findMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff } },
    select: { id: true }
  });
  for (const order of stale) {
    await releaseProductHold(order.id);
  }
}
