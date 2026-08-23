import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { notifyStockAlerts } from '@/lib/stock-alerts';
import {
  CHECKOUT_HOLD_MINUTES,
  holdExpiry,
  InsufficientStockError,
  type CheckoutLine
} from '@/lib/checkout-format';
import type { BundleStockLine } from '@/lib/bundles';
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
  checkoutLineFulfillment,
  checkoutLineName,
  bundleCheckoutLine,
  encodeCheckoutItems,
  parseCheckoutItems,
  stripeCheckoutItemsMetadata
} from '@/lib/checkout-format';

export type {
  CheckoutRequestedItem,
  CheckoutAdjustment,
  CheckoutLine,
  CheckoutBundleLine,
  CheckoutProductLine,
  ParsedCheckoutItem
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

  /**
   * What each set actually took, which is not always what it set out to take:
   * an extra whose shelf emptied between pricing the basket and reserving it is
   * dropped rather than failing the checkout. Recorded per line so the order
   * stores what went in the box, not what the recipe hoped would.
   */
  const takenByLine = new Map<CheckoutLine, BundleStockLine[]>();

  const order = await db.$transaction(async (transaction) => {
    for (const item of items) {
      /**
       * A set reserves the products it is built from, never itself: a bundle has
       * no count of its own, and inventing one here is the duplicate stock this
       * whole feature is designed not to keep.
       */
      const lines: BundleStockLine[] =
        item.kind === 'bundle'
          ? item.components
          : [
              {
                productId: item.product.id,
                name: item.product.name,
                size: item.size || null,
                quantity: item.quantity
              }
            ];
      const taken: BundleStockLine[] = [];

      for (const line of lines) {
        const slug = item.kind === 'bundle' ? item.bundle.slug : item.product.slug;
        const result = await transaction.product.updateMany({
          where: { id: line.productId, active: true, inventory: { gte: line.quantity } },
          data: { inventory: { decrement: line.quantity } }
        });
        if (result.count === 0) {
          // An extra is exactly the thing a set is allowed to go without.
          if (line.optional) continue;
          throw new InsufficientStockError(slug, line.size, line.name);
        }
        /**
         * The product having enough altogether is not the same question as this
         * size having enough: a plant with nine on the bench can still be out of
         * 6" pots. Throwing rolls back the decrement above along with the rest of
         * the hold, so a size that comes up short reserves nothing — and for a
         * set, one *required* component coming up short reserves none of the
         * others either.
         *
         * An extra that fails here has already had its total decremented, so it
         * is put straight back rather than left held for an order that will not
         * contain it.
         */
        if (!(await takeSizeStock(transaction, line.productId, line.size, line.quantity))) {
          if (line.optional) {
            await transaction.product.update({
              where: { id: line.productId },
              data: { inventory: { increment: line.quantity } }
            });
            continue;
          }
          throw new InsufficientStockError(slug, line.size, line.name);
        }
        taken.push(line);
      }

      takenByLine.set(item, taken);
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
          create: items.map((item) =>
            item.kind === 'bundle'
              ? {
                  bundleId: item.bundle.id,
                  name: item.bundle.title,
                  quantity: item.quantity,
                  unitCents: item.unitCents,
                  components: {
                    create: (takenByLine.get(item) || []).map(
                      ({ productId, name, size, quantity }) => ({
                        productId,
                        name,
                        size,
                        quantity
                      })
                    )
                  }
                }
              : {
                  productId: item.product.id,
                  name: item.product.name,
                  size: item.size || null,
                  quantity: item.quantity,
                  unitCents: item.unitCents
                }
          )
        }
      }
    });
  });

  return { order, holdId, expiresAt };
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

/**
 * The Prisma shape every restock path reads: the order's lines, plus for a
 * bundle line the components that actually left the shelf, each with the
 * product row a waiting-list notice needs.
 */
const restockInclude = {
  items: {
    include: {
      product: { select: { name: true, slug: true, inventory: true } },
      components: {
        include: { product: { select: { name: true, slug: true, inventory: true } } }
      }
    }
  }
} as const;

export type RestockOrder = {
  items: Array<{
    productId: string | null;
    name: string;
    size: string | null;
    quantity: number;
    product: { name: string; slug: string; inventory: number } | null;
    components: Array<{
      productId: string;
      name: string;
      size: string | null;
      quantity: number;
      product: { name: string; slug: string; inventory: number };
    }>;
  }>;
};

type ReturnedLine = {
  productId: string;
  size: string | null;
  quantity: number;
  product: { name: string; slug: string; inventory: number };
};

/** Every physical line an order's stock has to be given back on. */
function linesToReturn(order: RestockOrder): ReturnedLine[] {
  return order.items.flatMap((item) =>
    item.components.length
      ? item.components.map((component) => ({
          productId: component.productId,
          size: component.size,
          quantity: component.quantity,
          product: component.product
        }))
      : item.productId && item.product
        ? [
            {
              productId: item.productId,
              size: item.size,
              quantity: item.quantity,
              product: item.product
            }
          ]
        : []
  );
}

/**
 * Puts every line of an order back on the shelf inside an open transaction, and
 * answers with the products that crossed from sold out to sellable.
 *
 * The before/after counts are tracked per *product*, not per line, because one
 * order can touch the same product more than once — two sizes of a lotion, or a
 * set and a loose jar of the tea inside it. Reading "how many were there before"
 * off each line's own included row would read the same pre-transaction number
 * twice and could announce a restock that the second line had already covered.
 */
async function returnOrderStock(transaction: Prisma.TransactionClient, order: RestockOrder) {
  const before = new Map<string, number>();
  const after = new Map<string, number>();
  const named = new Map<string, { name: string; slug: string }>();

  for (const line of linesToReturn(order)) {
    if (!before.has(line.productId)) {
      before.set(line.productId, line.product.inventory);
      after.set(line.productId, line.product.inventory);
      named.set(line.productId, { name: line.product.name, slug: line.product.slug });
    }
    await transaction.product.update({
      where: { id: line.productId },
      data: { inventory: { increment: line.quantity } }
    });
    const returned = await returnSizeStock(transaction, line.productId, line.size, line.quantity);
    /**
     * A size the owner retired while this was in flight has nowhere to go back
     * to, so the total can come back unchanged — and a waiting list told "it's
     * back" about a product with nothing sellable on it would send everyone to
     * a sold-out page.
     */
    after.set(line.productId, returned ?? (after.get(line.productId) ?? 0) + line.quantity);
  }

  const restocked: Array<{ id: string; name: string; slug: string }> = [];
  for (const [productId, wasOnHand] of before) {
    const nowOnHand = after.get(productId) ?? wasOnHand;
    const naming = named.get(productId);
    if (wasOnHand <= 0 && nowOnHand > 0 && naming) {
      restocked.push({ id: productId, ...naming });
    }
  }
  return restocked;
}

export async function releaseProductHold(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: restockInclude
  });
  if (!order || order.status !== 'PENDING') return false;

  let restocked: Array<{ id: string; name: string; slug: string }> = [];
  let released = false;

  await db.$transaction(async (transaction) => {
    const claimed = await transaction.order.updateMany({
      where: { id: order.id, status: 'PENDING' },
      data: { status: 'CANCELLED', inventoryRestoredAt: new Date() }
    });
    if (claimed.count === 0) return;
    released = true;
    restocked = await returnOrderStock(transaction, order);
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
    include: restockInclude
  });
  if (!order || order.inventoryRestoredAt || order.fulfilledAt) return false;

  let restocked: Array<{ id: string; name: string; slug: string }> = [];
  let restored = false;

  await db.$transaction(async (transaction) => {
    const claimed = await transaction.order.updateMany({
      where: { id: order.id, inventoryRestoredAt: null, fulfilledAt: null },
      data: { inventoryRestoredAt: new Date() }
    });
    if (claimed.count === 0) return;
    restored = true;
    restocked = await returnOrderStock(transaction, order);
  });

  for (const product of restocked) {
    await notifyStockAlerts(product.id, product.name, product.slug);
  }

  return restored;
}

/**
 * The same give-back, for a caller that already holds the transaction and the
 * order's rows — the Stripe refund webhook, which has to claim the order and
 * return its stock in one go.
 */
export async function returnOrderStockInTransaction(
  transaction: Prisma.TransactionClient,
  order: RestockOrder
) {
  return returnOrderStock(transaction, order);
}

export { restockInclude };

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
