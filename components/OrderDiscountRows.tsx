import { giftCardTail } from '@/lib/discount-request';
import { formatMoney } from '@/lib/store';

/**
 * The discount lines on an order, for the dashboard and the packing slip.
 *
 * Shared rather than written twice because both are places Tammy reconciles a
 * total against, and a summary whose lines do not add up to what was charged is
 * worse than no summary: it reads as a mistake in the shop's arithmetic rather
 * than as a discount nobody printed.
 *
 * Itemised where the shop knows what the discount was, and shown as a single
 * "Discount" where it does not — a coupon entered on Stripe's own checkout page
 * reaches the order as an amount and nothing else.
 */
export default function OrderDiscountRows({
  order
}: {
  order: {
    discountCents: number;
    promoCode?: string | null;
    promoDiscountCents?: number;
    giftCardCode?: string | null;
    giftCardCents?: number;
  };
}) {
  const promoCents = order.promoDiscountCents || 0;
  const giftCardCents = order.giftCardCents || 0;
  const named = promoCents > 0 || giftCardCents > 0;

  if (!named && order.discountCents <= 0) return null;

  return (
    <>
      {promoCents > 0 && (
        <div className="summary-row">
          <span>Promo code {order.promoCode || ''}</span>
          <span>−{formatMoney(promoCents)}</span>
        </div>
      )}
      {giftCardCents > 0 && (
        <div className="summary-row">
          <span>Gift card ending {giftCardTail(order.giftCardCode || '')}</span>
          <span>−{formatMoney(giftCardCents)}</span>
        </div>
      )}
      {/* Only what the two named lines did not already account for. A Stripe
          coupon used on top of a shop code would otherwise be double-counted. */}
      {order.discountCents > promoCents + giftCardCents && (
        <div className="summary-row">
          <span>{named ? 'Other discount' : 'Discount'}</span>
          <span>−{formatMoney(order.discountCents - promoCents - giftCardCents)}</span>
        </div>
      )}
    </>
  );
}
