import { db } from '@/lib/db';
import { isAdmin } from '@/lib/admin';
import { csvCell } from '@/lib/csv';
import { isPickupOrder } from '@/lib/fulfillment';
import { AWAITING_SHIPMENT_STATUSES } from '@/lib/orders';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await isAdmin())) return new Response('Unauthorized', { status: 401 });
  const awaiting = await db.order.findMany({
    where: { status: { in: [...AWAITING_SHIPMENT_STATUSES] }, fulfilledAt: null },
    orderBy: { createdAt: 'asc' },
    include: { items: true }
  });
  const orders = awaiting.filter((order) => !isPickupOrder(order));
  const header = [
    'OrderNumber',
    'RecipientName',
    'Company',
    'Address1',
    'Address2',
    'City',
    'State',
    'PostalCode',
    'Country',
    'Email',
    'Phone',
    'ShippingMethod',
    'Fulfillment',
    'GiftMessage',
    'Items',
    'OrderTotal'
  ];
  const rows = orders.map((order) => [
    order.invoiceNumber,
    order.customerName,
    '',
    order.address1,
    order.address2,
    order.city,
    order.state,
    order.postalCode,
    order.country,
    order.email,
    order.phone,
    order.shippingMethod || 'Standard shipping',
    order.fulfillmentMethod === 'PICKUP' ? 'PICKUP' : 'SHIP',
    order.giftMessage || '',
    order.items.map((item) => `${item.quantity} x ${item.name}`).join('; '),
    (order.totalCents / 100).toFixed(2)
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${csv}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="hillside-unshipped-${stamp}.csv"`,
      'cache-control': 'no-store'
    }
  });
}
