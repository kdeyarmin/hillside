import { isAdmin } from '@/lib/admin';
import { csvCell } from '@/lib/csv';
import { db } from '@/lib/db';
import { newsletterSourceLabel } from '@/lib/newsletter-source';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await isAdmin())) return new Response('Unauthorized', { status: 401 });
  const subscribers = await db.newsletterSubscriber.findMany({ orderBy: { createdAt: 'desc' } });
  /**
   * Both the stored key and the readable label. A campaign platform wants to
   * segment on the key; a person reading the export in a spreadsheet wants to
   * know that "care-guide" means the plant care library.
   */
  const header = [
    'Email',
    'Name',
    'Active',
    'Source',
    'SourceLabel',
    'SourcePage',
    'JoinedAt',
    'UnsubscribedAt'
  ];
  const rows = subscribers.map((subscriber) => [
    subscriber.email,
    subscriber.name,
    subscriber.active ? 'Yes' : 'No',
    subscriber.source,
    newsletterSourceLabel(subscriber.source),
    subscriber.sourceDetail,
    subscriber.createdAt.toISOString(),
    subscriber.unsubscribedAt?.toISOString()
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  return new Response(`\uFEFF${csv}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="hillside-email-subscribers.csv"',
      'cache-control': 'no-store'
    }
  });
}
