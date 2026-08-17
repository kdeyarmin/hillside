import { emailShell, escapeHtml } from './email.ts';
import { formatMoney } from './store.ts';

export type OrderForEmail = {
  invoiceNumber: string;
  customerName: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  postalCode: string;
  totalCents: number;
  items: Array<{ name: string; quantity: number; unitCents: number }>;
};

/**
 * The customer-facing "we received your order" mail. The Stripe webhook and
 * the dashboard resend button have to produce the same letter — when they
 * drifted, a resend would have been a different email than the one that failed.
 */
export function orderConfirmationHtml(order: OrderForEmail) {
  const itemRows = order.items
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #dfe4dc">${escapeHtml(item.name)} × ${item.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #dfe4dc;text-align:right">${formatMoney(item.unitCents * item.quantity)}</td></tr>`
    )
    .join('');

  return emailShell(
    `Order ${order.invoiceNumber} received`,
    `<p>Hi ${escapeHtml(order.customerName)},</p><p>Thank you for shopping with The Hillside Gardens. Your payment was successful and we will begin preparing your order.</p><table style="width:100%;border-collapse:collapse;margin:20px 0">${itemRows}<tr><td style="padding-top:12px"><strong>Total</strong></td><td style="padding-top:12px;text-align:right"><strong>${formatMoney(order.totalCents)}</strong></td></tr></table><p><strong>Ship to</strong><br>${escapeHtml(order.address1)}${order.address2 ? `<br>${escapeHtml(order.address2)}` : ''}<br>${escapeHtml(order.city)}, ${escapeHtml(order.state)} ${escapeHtml(order.postalCode)}</p><p>You’ll receive another update when the order ships.</p>`
  );
}
