import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import {
  claimDiscounts,
  NO_DISCOUNTS,
  releaseOrderDiscounts,
  type DiscountPlan
} from '@/lib/discount-store';
import { notifyStockAlerts } from '@/lib/stock-alerts';
import {
  CHECKOUT_HOLD_MINUTES,
  holdExpiry,
  InsufficientStockError,
  type CheckoutLine
} from '@/lib/checkout-format';
import { shippingMethodLabel, type FulfillmentChoice } from '@/lib/fulfillment';
import {
  productInventoryForSizes,
  readStoredSizes,
  returnStoredSizeStock,
  storedSizesTrackStock,
  takeStoredSizeStock,
  type StoredSize
} from '@/lib/product-sizes';

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
  parseCheckoutItems,
  resolveCheckoutLines,
  stripeCheckoutItemsMetadata
} from '@/lib/checkout-format';

export type {
  CheckoutRequestedItem,
  CheckoutAdjustment,
  CheckoutLine,
  ParsedCheckoutItem,
  PricedProduct,
  ResolvedCheckoutLine
} from '@/lib/checkout-format';

/**
 * Moves stock on or off a size's own count, and rewrites the product's total
 * from what the sizes add up to afterwards.
 *
 * Every caller runs this *after* a write to `Product.inventory` that it has
 * made sure matched the row, in the same transaction, and that ordering is the
 * whole safety argument: the lock Postgres took on the row for that write is
 * held until the transaction commits, so no second checkout can read these
 * sizes between the read and the write below. Reading the sizes first would put
 * two shoppers on the last 6" pot. It is also why nothing here needs a
 * compare-and-set of its own — and why a caller whose write is conditional has
 * to make the fallback unconditional rather than let a no-op skip the lock.
 *
 * Rewriting the total rather than trusting the caller's increment is what keeps
 * the column and the size list from disagreeing about whether the product is
 * sold out — every "is this sellable" query in the shop reads the column alone.
 */
async function moveSizeStock(
  transaction: Prisma.TransactionClient,
  productId: string,
  move: (stored: StoredSize[]) => { sizes: StoredSize[]; took: boolean }
): Promise<{ took: boolean; inventory: number | null }> {
  const row = await transaction.product.findUnique({
    where: { id: productId },
    select: { sizes: true, inventory: true }
  });
  const stored = readStoredSizes(row?.sizes);
  // Nothing to move for a product sold one way, or sold in sizes off one shelf:
  // the caller's write to the product row already did the whole job.
  if (!storedSizesTrackStock(stored)) return { took: true, inventory: null };

  const { sizes, took } = move(stored);
  const inventory = productInventoryForSizes(sizes, row?.inventory ?? 0);
  await transaction.product.update({
    where: { id: productId },
    data: { sizes: sizes as Prisma.InputJsonValue, inventory }
  });
  return { took, inventory };
}

/**
 * Spends a counted size. False means the size did not have it — the caller
 * either throws, rolling the transaction back, or reports the oversell.
 */
export async function takeSizeStock(
  transaction: Prisma.TransactionClient,
  productId: string,
  size: string | null | undefined,
  quantity: number
) {
  const { took } = await moveSizeStock(transaction, productId, (stored) =>
    takeStoredSizeStock(stored, size, quantity)
  );
  return took;
}

/**
 * Puts a counted size's stock back, answering with the product's new total so
 * the caller can tell whether this is the restock a waiting list is owed.
 */
export async function returnSizeStock(
  transaction: Prisma.TransactionClient,
  productId: string,
  size: string | null | undefined,
  quantity: number
) {
  const { inventory } = await moveSizeStock(transaction, productId, (stored) => ({
    sizes: returnStoredSizeStock(stored, size, quantity),
    took: true
  }));
  return inventory;
}

/**
 * Reserves the stock and — where the basket carries a code — the discount, in
 * one transaction.
 *
 * `shippingCents` is the rate the basket would pay with no promotion on it.
 * Whether it actually pays that is decided in here, because a free-shipping
 * code is only *held* at the same moment the stock is, and a code whose last
 * redemption went to somebody else a second ago has to leave this order
 * carrying the full rate rather than a figure nothing backs.
 */
export async function reserveProductOrder({
  invoiceNumber,
  items,
  subtotalCents,
  shippingCents,
  fulfillmentMethod,
  giftMessage,
  discountPlan
}: {
  invoiceNumber: string;
  items: CheckoutLine[];
  subtotalCents: number;
  shippingCents: number;
  fulfillmentMethod: FulfillmentChoice;
  giftMessage?: string | null;
  discountPlan?: DiscountPlan | null;
}) {
  const expiresAt = holdExpiry();
  const holdId = `hold_${crypto.randomUUID()}`;
  const claiming = Boolean(discountPlan?.promotion || discountPlan?.giftCard);
  const plannedShipping = discountPlan?.freeShipping ? 0 : shippingCents;
  const plannedDiscount =
    (discountPlan?.promoDiscountCents || 0) + (discountPlan?.giftCardCents || 0);

  const reserved = await db.$transaction(async (transaction) => {
    for (const item of items) {
      const result = await transaction.product.updateMany({
        where: { id: item.product.id, active: true, inventory: { gte: item.quantity } },
        data: { inventory: { decrement: item.quantity } }
      });
      if (result.count === 0) {
        throw new InsufficientStockError(item.product.slug, item.size || null);
      }
      /**
       * The product having enough altogether is not the same question as this
       * size having enough: a plant with nine on the bench can still be out of
       * 6" pots. Throwing rolls back the decrement above along with the rest of
       * the hold, so a size that comes up short reserves nothing.
       */
      if (!(await takeSizeStock(transaction, item.product.id, item.size, item.quantity))) {
        throw new InsufficientStockError(item.product.slug, item.size || null);
      }
    }

    const order = await transaction.order.create({
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
        shippingCents: plannedShipping,
        taxCents: 0,
        discountCents: plannedDiscount,
        totalCents: Math.max(0, subtotalCents + plannedShipping - plannedDiscount),
        fulfillmentMethod,
        giftMessage: giftMessage || null,
        shippingMethod: shippingMethodLabel(fulfillmentMethod, plannedShipping),
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

    if (!claiming || !discountPlan) return { order, discounts: NO_DISCOUNTS };

    const discounts = await claimDiscounts(transaction, order.id, discountPlan);
    const appliedShipping = discounts.freeShipping ? 0 : shippingCents;
    const appliedDiscount = discounts.promoDiscountCents + discounts.giftCardCents;
    if (appliedShipping === plannedShipping && appliedDiscount === plannedDiscount) {
      return { order, discounts };
    }

    /**
     * Part of the plan was lost to another basket between pricing this one and
     * reserving it. The order is rewritten to what was actually held, so the
     * row, the Stripe session built from it and the money the customer is asked
     * for all say the same thing.
     */
    const corrected = await transaction.order.update({
      where: { id: order.id },
      data: {
        shippingCents: appliedShipping,
        discountCents: appliedDiscount,
        totalCents: Math.max(0, subtotalCents + appliedShipping - appliedDiscount),
        shippingMethod: shippingMethodLabel(fulfillmentMethod, appliedShipping)
      }
    });
    return { order: corrected, discounts };
  });

  return { order: reserved.order, discounts: reserved.discounts, holdId, expiresAt };
}

/**
 * Decrement `quantity` when the shelf has it. If it does not — a paid order
 * settling after the hold was released and someone else bought the last of it —
 * zero whatever is left so the leftover 1–2 cannot be sold again on top of the
 * oversell. Returns whether the full quantity was taken.
 *
 * On a product counted per size the zeroing lands on the size that was oversold
 * and nowhere else: `takeSizeStock` empties that one and rewrites the total from
 * the sizes, so the 4" pots stay sellable when the last 6" one was sold twice.
 * A size that comes up short while the product has plenty is an oversell too,
 * which is why both answers are needed here.
 *
 * A line whose size cannot be matched at all — a pre-sizes session snapshot for
 * a product counted per size since — takes nothing off any size, and rewriting
 * the total from the sizes puts the decrement above back. That is the honest
 * answer: there is no size to charge it to, and the oversell notice this returns
 * false for is what sends the owner to the bench.
 */
export async function takeAvailableInventory(
  transaction: Prisma.TransactionClient,
  productId: string,
  quantity: number,
  size: string | null = null
) {
  const full = await transaction.product.updateMany({
    where: { id: productId, inventory: { gte: quantity } },
    data: { inventory: { decrement: quantity } }
  });
  if (full.count === 0) {
    /**
     * Unconditional, where this once skipped a row already at zero. Writing zero
     * over zero changes nothing about the column, but it is still a write, and
     * the row lock it takes is what `takeSizeStock` reads the size JSON under.
     * Guarded on `inventory > 0`, a late-settling order against a product whose
     * total had already reached zero locked nothing at all, and a refund or a
     * released hold landing in that window would have its returned counts —
     * including the counts of every other size — overwritten by the stale array
     * this then wrote back.
     */
    await transaction.product.updateMany({
      where: { id: productId },
      data: { inventory: 0 }
    });
  }
  const tookSize = await takeSizeStock(transaction, productId, size, quantity);
  return full.count > 0 && tookSize;
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
  let released = false;

  await db.$transaction(async (transaction) => {
    const claimed = await transaction.order.updateMany({
      where: { id: order.id, status: 'PENDING' },
      data: { status: 'CANCELLED', inventoryRestoredAt: new Date() }
    });
    if (claimed.count === 0) return;
    released = true;

    // The promo slot and the gift-card money this checkout was sitting on go
    // back with the stock. Both are as unavailable to the next customer as the
    // plant was while this basket held them.
    await releaseOrderDiscounts(transaction, order.id);

    for (const item of order.items) {
      const previousInventory = item.product.inventory;
      await transaction.product.update({
        where: { id: item.productId },
        data: { inventory: { increment: item.quantity } }
      });
      const returned = await returnSizeStock(transaction, item.productId, item.size, item.quantity);
      /**
       * A size the owner retired while this was in flight has nowhere to go
       * back to, so the total can come back unchanged — and a waiting list told
       * "it's back" about a product with nothing sellable on it would send
       * everyone to a sold-out page.
       */
      const nowOnHand = returned ?? previousInventory + item.quantity;
      if (previousInventory <= 0 && nowOnHand > 0) {
        restocked.push({ id: item.productId, name: item.product.name, slug: item.product.slug });
      }
    }
  });

  for (const product of restocked) {
    await notifyStockAlerts(product.id, product.name, product.slug);
  }

  return released;
}

/**
 * Return stock for a paid order that never shipped or was picked up. Used when
 * Tammy cancels a paid order from the dashboard. Refunds of unshipped orders
 * use the same `inventoryRestoredAt` + `fulfilledAt` guards in the webhook so
 * a plant that already left the bench cannot reappear as sellable.
 */
export async function restoreUnshippedOrderInventory(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: { select: { name: true, slug: true, inventory: true } } } }
    }
  });
  if (!order || order.inventoryRestoredAt || order.fulfilledAt) return false;

  const restocked: Array<{ id: string; name: string; slug: string }> = [];
  let restored = false;

  await db.$transaction(async (transaction) => {
    const claimed = await transaction.order.updateMany({
      where: { id: order.id, inventoryRestoredAt: null, fulfilledAt: null },
      data: { inventoryRestoredAt: new Date() }
    });
    if (claimed.count === 0) return;
    restored = true;

    for (const item of order.items) {
      const previousInventory = item.product.inventory;
      await transaction.product.update({
        where: { id: item.productId },
        data: { inventory: { increment: item.quantity } }
      });
      const returned = await returnSizeStock(transaction, item.productId, item.size, item.quantity);
      /**
       * A size the owner retired while this was in flight has nowhere to go
       * back to, so the total can come back unchanged — and a waiting list told
       * "it's back" about a product with nothing sellable on it would send
       * everyone to a sold-out page.
       */
      const nowOnHand = returned ?? previousInventory + item.quantity;
      if (previousInventory <= 0 && nowOnHand > 0) {
        restocked.push({ id: item.productId, name: item.product.name, slug: item.product.slug });
      }
    }
  });

  for (const product of restocked) {
    await notifyStockAlerts(product.id, product.name, product.slug);
  }

  return restored;
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
