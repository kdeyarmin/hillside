'use client';

import { useState } from 'react';
import { Gift, Tag, X } from 'lucide-react';
import FormStatus from '@/components/FormStatus';
import { useCart, type DiscountField } from '@/components/CartProvider';
import { CODE_INPUT_MAX } from '@/lib/discount-request';
import { formatMoney } from '@/lib/store';

/**
 * The two code boxes on the cart page.
 *
 * Deliberately separate boxes rather than one "have a code?" field. They are
 * different things — a promo code is the shop's discount, a gift card is the
 * customer's own money — they can be used together, and a single field would
 * have to guess which of the two somebody had just typed and would guess wrong
 * on the day a promo code happened to look like a card number.
 */
export default function DiscountCodeFields() {
  const {
    items,
    appliedCodes,
    discount,
    discountPending,
    discountErrors,
    applyDiscountCode,
    removeDiscountCode
  } = useCart();
  const [drafts, setDrafts] = useState<Record<DiscountField, string>>({
    promoCode: '',
    giftCardCode: ''
  });

  if (!items.length) return null;

  const submit = async (field: DiscountField) => {
    const typed = drafts[field].trim();
    if (!typed) return;
    await applyDiscountCode(field, typed);
    setDrafts((current) => ({ ...current, [field]: '' }));
  };

  const field = (
    key: DiscountField,
    {
      label,
      hint,
      placeholder,
      icon,
      applied
    }: {
      label: string;
      hint: string;
      placeholder: string;
      icon: React.ReactNode;
      applied: { code: string; detail: string; saved: string } | null;
    }
  ) => (
    <div className="discount-field">
      {applied ? (
        <div className="discount-applied">
          <span className="discount-chip">
            {icon}
            <span>
              <b>{applied.code}</b>
              <small>{applied.detail}</small>
            </span>
          </span>
          <span className="discount-saved">{applied.saved}</span>
          <button
            className="text-button"
            type="button"
            onClick={() => removeDiscountCode(key)}
            aria-label={`Remove ${label.toLowerCase()} ${applied.code}`}
          >
            <X size={14} aria-hidden="true" /> Remove
          </button>
        </div>
      ) : (
        <>
          <label className="discount-label" htmlFor={`cart-${key}`}>
            {label}
            <small>{hint}</small>
          </label>
          <div className="discount-row">
            <input
              id={`cart-${key}`}
              className="form-input"
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={CODE_INPUT_MAX}
              placeholder={placeholder}
              value={drafts[key]}
              onChange={(event) =>
                setDrafts((current) => ({ ...current, [key]: event.target.value }))
              }
              // The cart page is not one form, so Enter has nothing to submit.
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                void submit(key);
              }}
            />
            <button
              className="btn outline small"
              type="button"
              disabled={!drafts[key].trim() || discountPending === key}
              aria-busy={discountPending === key}
              onClick={() => void submit(key)}
            >
              {discountPending === key ? 'Checking…' : 'Apply'}
            </button>
          </div>
        </>
      )}
      <FormStatus message={discountErrors[key]} tone="error" />
    </div>
  );

  return (
    <div className="discount-fields">
      {field('promoCode', {
        label: 'Promo code',
        hint: 'If we sent you one, enter it here.',
        placeholder: 'SPRING20',
        icon: <Tag size={14} aria-hidden="true" />,
        applied:
          discount?.promotion && appliedCodes.promoCode
            ? {
                code: discount.promotion.code,
                detail: discount.promotion.summary,
                saved: discount.freeShipping
                  ? 'Free shipping'
                  : `−${formatMoney(discount.promoDiscountCents)}`
              }
            : null
      })}
      {field('giftCardCode', {
        label: 'Gift card',
        hint: 'The number on your card. Whatever it does not cover is paid at checkout.',
        placeholder: 'XXXX-XXXX-XXXX-XXXX',
        icon: <Gift size={14} aria-hidden="true" />,
        applied:
          discount?.giftCard && appliedCodes.giftCardCode
            ? {
                code: discount.giftCard.maskedCode,
                detail: `${formatMoney(discount.giftCard.balanceCents)} on the card`,
                saved: `−${formatMoney(discount.giftCardCents)}`
              }
            : null
      })}
    </div>
  );
}
