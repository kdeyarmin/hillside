import { db } from '@/lib/db';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { absoluteUrl } from '@/lib/store';

/** Emails everyone still waiting on this product. Safe to call repeatedly. */
export async function notifyStockAlerts(productId: string, name: string, slug: string) {
  const waiting = await db.stockAlert.findMany({ where: { productId, notifiedAt: null } });
  if (!waiting.length) return;

  for (const alert of waiting) {
    const delivery = await sendEmail({
      to: alert.email,
      subject: `${name} is back at The Hillside Gardens`,
      idempotencyKey: `stock-alert/${alert.id}`,
      html: emailShell(
        `${name} is back`,
        `<p>You asked us to let you know when <strong>${escapeHtml(name)}</strong> returned. It is back on the shelf now.</p><p><a href="${absoluteUrl(`/shop/${slug}`)}">View ${escapeHtml(name)}</a></p><p>Stock is limited, so it may not last long.</p>`
      )
    });
    if (delivery.sent) {
      await db.stockAlert.update({ where: { id: alert.id }, data: { notifiedAt: new Date() } });
    }
  }
}
