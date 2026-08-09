import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export async function GET() {
  if (!(await isAdmin())) return new Response('Unauthorized', { status: 401 });
  const subscribers = await db.newsletterSubscriber.findMany({ orderBy: { createdAt: 'desc' } });
  const header = ['Email', 'Name', 'Active', 'Source', 'JoinedAt', 'UnsubscribedAt'];
  const rows = subscribers.map((subscriber) => [subscriber.email, subscriber.name, subscriber.active ? 'Yes' : 'No', subscriber.source, subscriber.createdAt.toISOString(), subscriber.unsubscribedAt?.toISOString()]);
  const csv = [header, ...rows].map((row) => row.map(quote).join(',')).join('\r\n');
  return new Response(`\uFEFF${csv}`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="hillside-email-subscribers.csv"', 'cache-control': 'no-store' } });
}
