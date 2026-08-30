import { db } from '@/lib/db';
import { orderConfirmationHtml } from '@/lib/order-email';
import { sendEmail } from '@/lib/email';
import { isAwaitingShipment } from '@/lib/orders';
import { reportError } from '@/lib/report-error';

/**
 * Sends (or resends) the customer order confirmation and records the result
 * on the order. `force` is the dashboard button: it ignores a previous send
 * and uses a fresh idempotency key so Resend will actually deliver again.
 */
export async function sendOrderConfirmationEmail(
  orderId: string,
  options: { force?: boolean } = {}
): Promise<{ sent: boolean; reason?: string; invoiceNumber?: string }> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    // A set's line names the box; its components say what was in it, which is
    // the only place the customer's own copy of the order can say so.
    include: { items: { include: { components: true } } }
  });
  if (!order) return { sent: false, reason: 'missing' };
  if (!isAwaitingShipment(order.status, order.fulfilledAt)) {
    return { sent: false, reason: 'not-confirmable', invoiceNumber: order.invoiceNumber };
  }
  if (!options.force && order.confirmationEmailSentAt) {
    return { sent: true, reason: 'already-sent', invoiceNumber: order.invoiceNumber };
  }
  if (!order.email) return { sent: false, reason: 'no-email', invoiceNumber: order.invoiceNumber };

  const delivery = await sendEmail({
    to: order.email,
    kind: 'ORDER_CONFIRMATION',
    subject: `We received your Hillside order ${order.invoiceNumber}`,
    html: orderConfirmationHtml(order),
    idempotencyKey: options.force
      ? `order-confirmation/${order.id}/resend/${Date.now()}`
      : `order-confirmation/${order.id}`
  });

  /**
   * A confirmation that did not go out is recorded on the order, and the caller
   * — the Stripe webhook, or Tammy's resend button — carries on regardless,
   * because a paid order must be saved whether or not the letter about it
   * arrived. That is right, and it is also exactly how this failure stayed
   * hidden: the customer is not told, the webhook reports success to Stripe, and
   * the only sign is a `confirmationEmailError` on a row nobody has cause to
   * open. Money has already changed hands by this point, so it is worth waking
   * someone for.
   */
  if (!delivery.sent) {
    reportError(
      'Order confirmation email did not go out',
      new Error(delivery.reason || 'unknown-error'),
      { invoiceNumber: order.invoiceNumber, orderId: order.id, resend: Boolean(options.force) }
    );
  }

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
