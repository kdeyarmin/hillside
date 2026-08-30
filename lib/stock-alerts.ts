import { db } from '@/lib/db';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { absoluteUrl } from '@/lib/store';

/**
 * Emails everyone still waiting on this product. Safe to call repeatedly, and
 * safe to call from two places at once.
 *
 * Each alert is *claimed before it is sent*, with a conditional update that only
 * one caller can win. Reading the whole waiting list and marking each row after
 * its email went out left a window between the read and the mark: a restock from
 * the dashboard and a refund arriving by webhook overlap perfectly well, both
 * read the same unnotified rows, and both send. The in-process guard in
 * `sendEmail` does not help — it only records a key once a send has finished, so
 * two sends already in flight never see each other.
 *
 * The claim is released again if the send fails, so a SendGrid outage leaves the
 * customer on the list for the next restock rather than silently dropping them.
 * This is the same pattern `review-request-send` uses for the same reason.
 */
export async function notifyStockAlerts(productId: string, name: string, slug: string) {
  const waiting = await db.stockAlert.findMany({ where: { productId, notifiedAt: null } });
  if (!waiting.length) return;

  for (const alert of waiting) {
    const claimed = await db.stockAlert.updateMany({
      where: { id: alert.id, notifiedAt: null },
      data: { notifiedAt: new Date() }
    });
    // Somebody else is already telling this customer.
    if (claimed.count === 0) continue;

    const delivery = await sendEmail({
      to: alert.email,
      kind: 'STOCK_ALERT',
      subject: `${name} is back at The Hillside Gardens`,
      idempotencyKey: `stock-alert/${alert.id}`,
      html: emailShell(
        `${name} is back`,
        `<p>You asked us to let you know when <strong>${escapeHtml(name)}</strong> returned. It is back on the shelf now.</p><p><a href="${absoluteUrl(`/shop/${slug}`)}">View ${escapeHtml(name)}</a></p><p>Stock is limited, so it may not last long.</p>`
      )
    });

    if (!delivery.sent) {
      await db.stockAlert.updateMany({
        where: { id: alert.id, notifiedAt: { not: null } },
        data: { notifiedAt: null }
      });
    }
  }
}
