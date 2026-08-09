import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export async function GET() {
  if (!(await isAdmin())) return new Response('Unauthorized', { status: 401 });
  const orders = await db.order.findMany({ orderBy: { createdAt: 'desc' }, include: { items: true } });
  const header = ['OrderNumber', 'CreatedAt', 'Status', 'Customer', 'Email', 'Phone', 'Subtotal', 'Shipping', 'Tax', 'Total', 'Carrier', 'Tracking', 'Items'];
  const rows = orders.map((order) => [order.invoiceNumber, order.createdAt.toISOString(), order.status, order.customerName, order.email, order.phone, (order.subtotalCents / 100).toFixed(2), (order.shippingCents / 100).toFixed(2), (order.taxCents / 100).toFixed(2), (order.totalCents / 100).toFixed(2), order.trackingCarrier, order.trackingNumber, order.items.map((item) => `${item.quantity} x ${item.name}`).join('; ')]);
  const csv = [header, ...rows].map((row) => row.map(quote).join(',')).join('\r\n');
  return new Response(`\uFEFF${csv}`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="hillside-orders.csv"', 'cache-control': 'no-store' } });
}
