import { db } from '@/lib/db';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { absoluteUrl, formatMoney } from '@/lib/store';

/**
 * Sends a gift card to the person it was bought for.
 *
 * This is the only copy of the code that ever leaves the shop, which is why the
 * dashboard keeps its own and why the sent-mail log stores the body with the
 * code masked: the email is the customer's copy, not a second record.
 *
 * `lastSentAt` is stamped on success only. A card that could not be emailed has
 * to keep looking un-sent, because the thing Tammy does about it is send it
 * again.
 */
export async function sendGiftCardEmail(giftCardId: string) {
  const card = await db.giftCard.findUnique({ where: { id: giftCardId } });
  if (!card) return { sent: false, reason: 'missing' as const };
  if (!card.recipientEmail) return { sent: false, reason: 'no-email' as const };

  const from = card.purchaserName?.trim();
  const greeting = card.recipientName?.trim()
    ? `<p>Hello ${escapeHtml(card.recipientName.trim())},</p>`
    : '<p>Hello,</p>';
  const opening = from
    ? `<p><strong>${escapeHtml(from)}</strong> has sent you a gift card for The Hillside Gardens.</p>`
    : '<p>Here is your gift card for The Hillside Gardens.</p>';
  const note = card.message?.trim()
    ? `<p style="padding:14px 16px;background:#edf1e9;border-radius:12px;font-style:italic">${escapeHtml(
        card.message.trim()
      ).replaceAll('\n', '<br>')}</p>`
    : '';
  const expiry = card.expiresAt
    ? `<p>Please use it by <strong>${escapeHtml(card.expiresAt.toLocaleDateString('en-US', { dateStyle: 'long' }))}</strong>.</p>`
    : '';
  const shopUrl = absoluteUrl('/shop');

  const delivery = await sendEmail({
    to: card.recipientEmail,
    kind: 'GIFT_CARD',
    subject: `Your ${formatMoney(card.balanceCents)} gift card for The Hillside Gardens`,
    idempotencyKey: `gift-card/${card.id}/${card.lastSentAt ? Date.now() : 'first'}`,
    html: emailShell(
      'A gift card for you',
      `${greeting}${opening}${note}
      <p style="margin:22px 0;padding:20px;border:1px dashed #315a3d;border-radius:14px;text-align:center">
        <span style="display:block;color:#636e66;font-size:13px;letter-spacing:0.08em;text-transform:uppercase">Gift card</span>
        <strong style="display:block;margin:8px 0;font-size:26px;letter-spacing:0.12em;color:#203f2b">${escapeHtml(card.code)}</strong>
        <span style="display:block;font-size:18px;color:#315a3d">${formatMoney(card.balanceCents)}</span>
      </p>
      ${expiry}
      <p>Enter the number in your basket at <a href="${escapeHtml(shopUrl)}">${escapeHtml(shopUrl)}</a>. It comes off the plants, teas and botanicals in your order, and whatever you do not spend stays on the card for next time.</p>
      <p>Keep this email — the number on it is what spends the card.</p>`
    )
  });

  if (delivery.sent) {
    await db.giftCard.update({ where: { id: card.id }, data: { lastSentAt: new Date() } });
  }
  return delivery;
}
