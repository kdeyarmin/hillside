import { isAdmin } from '@/lib/admin';
import { csvCell } from '@/lib/csv';
import { db } from '@/lib/db';
import { sizedName } from '@/lib/product-sizes';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await isAdmin())) return new Response('Unauthorized', { status: 401 });
  const orders = await db.order.findMany({
    orderBy: { createdAt: 'desc' },
    include: { items: true }
  });
  const header = [
    'OrderNumber',
    'CreatedAt',
    'Status',
    'Fulfillment',
    'Customer',
    'Email',
    'Phone',
    'Subtotal',
    'Shipping',
    'Tax',
    'Total',
    'Carrier',
    'Tracking',
    'GiftMessage',
    'Items'
  ];
  const rows = orders.map((order) => [
    order.invoiceNumber,
    order.createdAt.toISOString(),
    order.status,
    order.fulfillmentMethod === 'PICKUP' ? 'PICKUP' : 'SHIP',
    order.customerName,
    order.email,
    order.phone,
    (order.subtotalCents / 100).toFixed(2),
    (order.shippingCents / 100).toFixed(2),
    (order.taxCents / 100).toFixed(2),
    (order.totalCents / 100).toFixed(2),
    order.trackingCarrier,
    order.trackingNumber,
    order.giftMessage || '',
    order.items.map((item) => `${item.quantity} x ${sizedName(item.name, item.size)}`).join('; ')
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  return new Response(`\uFEFF${csv}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="hillside-orders.csv"',
      'cache-control': 'no-store'
    }
  });
}
