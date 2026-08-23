/**
 * The bridge between an order line and the shelf.
 *
 * An order line is either one product or one bundle, and only the first has a
 * product of its own. A bundle line's stock lives in its `components` — the
 * snapshot of what was taken off the bench when the set was sold — so every
 * path that moves inventory for an order (reserving it, releasing a hold,
 * cancelling, refunding, re-acquiring after a late settlement) asks here rather
 * than reading `productId` and quietly doing nothing for a set.
 *
 * Kept free of Prisma so the flattening is testable on its own.
 */

export type OrderStockLine = {
  productId: string;
  /** The product's name as it was sold, for oversell notices. */
  name: string;
  size: string | null;
  quantity: number;
};

export type OrderItemLike = {
  productId: string | null;
  name: string;
  size: string | null;
  quantity: number;
  components?: Array<{
    productId: string;
    name: string;
    size: string | null;
    quantity: number;
  }> | null;
};

/**
 * What one order line moves. A bundle's components already carry the total for
 * the line — the recipe's quantity multiplied by the number of sets bought — so
 * nothing here multiplies again.
 *
 * A line with neither a product nor components yields nothing rather than
 * throwing: that is a bundle deleted down to nothing or a corrupted row, and a
 * refund that silently skips a line it cannot place is better than one that
 * throws away the rest of the order with it.
 */
export function orderItemStockLines(item: OrderItemLike): OrderStockLine[] {
  if (item.components?.length) {
    return item.components.map((component) => ({
      productId: component.productId,
      name: component.name,
      size: component.size,
      quantity: component.quantity
    }));
  }
  if (!item.productId) return [];
  return [
    {
      productId: item.productId,
      name: item.name,
      size: item.size,
      quantity: item.quantity
    }
  ];
}

export function orderStockLines(order: { items: OrderItemLike[] }): OrderStockLine[] {
  return order.items.flatMap(orderItemStockLines);
}
