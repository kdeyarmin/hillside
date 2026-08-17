import { db } from '@/lib/db';
import { orderConfirmationHtml } from '@/lib/order-email';
import { sendEmail } from '@/lib/email';
import { isAwaitingShipment } from '@/lib/orders';

/**
 * Sends (or resends) the customer order confirmation and records the result
 * on the order. `force` is the dashboard button: it ignores a previous send
 * and uses a fresh idempotency key so Resend will actually deliver again.
 */
export async function sendOrderConfirmationEmail(
  orderId: string,
  options: { force?: boolean } = {}
): Promise<{ sent: boolean; reason?: string; invoiceNumber?: string }> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return { sent: false, reason: 'missing' };
  if (!isAwaitingShipment(order.status)) {
    return { sent: false, reason: 'not-confirmable', invoiceNumber: order.invoiceNumber };
  }
  if (!options.force && order.confirmationEmailSentAt) {
    return { sent: true, reason: 'already-sent', invoiceNumber: order.invoiceNumber };
  }
  if (!order.email) return { sent: false, reason: 'no-email', invoiceNumber: order.invoiceNumber };

  const delivery = await sendEmail({
    to: order.email,
    subject: `We received your Hillside order ${order.invoiceNumber}`,
    html: orderConfirmationHtml(order),
    idempotencyKey: options.force
      ? `order-confirmation/${order.id}/resend/${Date.now()}`
      : `order-confirmation/${order.id}`
  });

  await db.order.update({
    where: { id: order.id },
    data: delivery.sent
      ? { confirmationEmailSentAt: new Date(), confirmationEmailError: null }
      : { confirmationEmailError: delivery.reason || 'unknown-error' }
  });

  return {
    sent: delivery.sent,
    reason: delivery.reason,
    invoiceNumber: order.invoiceNumber
  };
}
