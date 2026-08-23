import { emailShell, escapeHtml } from './email.ts';
import { isPickupOrder } from './fulfillment.ts';
import { sizedName } from './product-sizes.ts';
import { absoluteUrl, formatMoney } from './store.ts';

export type OrderForEmail = {
  invoiceNumber: string;
  customerName: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  postalCode: string;
  totalCents: number;
  subtotalCents?: number;
  shippingCents?: number;
  taxCents?: number;
  discountCents?: number;
  giftMessage?: string | null;
  fulfillmentMethod?: string | null;
  shippingMethod?: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unitCents: number;
    size?: string | null;
    /**
     * What a set contained. A bundle line is one name and one price, so without
     * this the customer's own copy of the order is the only place that does not
     * say what they bought.
     */
    components?: Array<{ name: string; size?: string | null; quantity: number }> | null;
  }>;
};

/**
 * The customer-facing "we received your order" mail. The Stripe webhook and
 * the dashboard resend button have to produce the same letter — when they
 * drifted, a resend would have been a different email than the one that failed.
 */
export function orderConfirmationHtml(order: OrderForEmail) {
  const pickup = isPickupOrder(order);
  const itemRows = order.items
    .map((item) => {
      const contents = item.components?.length
        ? `<br><span style="color:#5d6b5f;font-size:13px">${escapeHtml(
            item.components
              .map(
                (component) =>
                  `${sizedName(component.name, component.size)} × ${component.quantity}`
              )
              .join(' · ')
          )}</span>`
        : '';
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #dfe4dc">${escapeHtml(sizedName(item.name, item.size))} × ${item.quantity}${contents}</td><td style="padding:8px 0;border-bottom:1px solid #dfe4dc;text-align:right">${formatMoney(item.unitCents * item.quantity)}</td></tr>`;
    })
    .join('');
  const discountCents = order.discountCents || 0;
  const shippingCents = order.shippingCents || 0;
  const taxCents = order.taxCents || 0;
  /**
   * The packing slip already printed shipping, tax and discount so the lines
   * added up to Total. This letter used to list only the items and then the
   * charged total, so a $8.95 ship or a promotion made the arithmetic look
   * wrong in the customer's inbox.
   */
  const shippingLabel = pickup ? 'Pickup' : 'Shipping';
  const totalRows = `${
    discountCents > 0
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #dfe4dc">Discount</td><td style="padding:8px 0;border-bottom:1px solid #dfe4dc;text-align:right">−${formatMoney(discountCents)}</td></tr>`
      : ''
  }<tr><td style="padding:8px 0;border-bottom:1px solid #dfe4dc">${shippingLabel}</td><td style="padding:8px 0;border-bottom:1px solid #dfe4dc;text-align:right">${formatMoney(shippingCents)}</td></tr>${
    taxCents > 0
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #dfe4dc">Tax</td><td style="padding:8px 0;border-bottom:1px solid #dfe4dc;text-align:right">${formatMoney(taxCents)}</td></tr>`
      : ''
  }`;
  const giftHtml = order.giftMessage
    ? `<p><strong>Gift message</strong><br>${escapeHtml(order.giftMessage).replaceAll('\n', '<br>')}</p>`
    : '';
  const destinationHtml = pickup
    ? `<p><strong>Local pickup in Ebensburg</strong><br>This pickup was arranged with us. We will email exact instructions when the order is ready. Please do not come until you hear from us.</p>`
    : `<p><strong>Ship to</strong><br>${escapeHtml(order.address1)}${order.address2 ? `<br>${escapeHtml(order.address2)}` : ''}<br>${escapeHtml(order.city)}, ${escapeHtml(order.state)} ${escapeHtml(order.postalCode)}</p>`;
  const intro = pickup
    ? 'Thank you for shopping with The Hillside Gardens. Your payment was successful. This order is for local pickup, as arranged. We will begin preparing it and email you when it is ready.'
    : 'Thank you for shopping with The Hillside Gardens. Your payment was successful and we will begin preparing your order.';
  const closing = pickup ? '' : '<p>You’ll receive another update when the order ships.</p>';
  const statusUrl = absoluteUrl('/order-status');

  return emailShell(
    `Order ${order.invoiceNumber} received`,
    `<p>Hi ${escapeHtml(order.customerName)},</p><p>${intro}</p><table style="width:100%;border-collapse:collapse;margin:20px 0">${itemRows}${totalRows}<tr><td style="padding-top:12px"><strong>Total</strong></td><td style="padding-top:12px;text-align:right"><strong>${formatMoney(order.totalCents)}</strong></td></tr></table>${destinationHtml}${giftHtml}<p>Look this order up any time with your HG number and checkout email: <a href="${escapeHtml(statusUrl)}">${escapeHtml(statusUrl)}</a></p>${closing}`
  );
}
