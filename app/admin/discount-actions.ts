'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { DiscountKind, Prisma } from '@prisma/client';
import { currentAdmin, isAdmin } from '@/lib/admin';
import { adminDiscountsPath } from '@/lib/admin-dashboard';
import { db } from '@/lib/db';
import { isValidPromoCode, normalizePromoCode } from '@/lib/discount-codes';
import {
  adjustGiftCardBalance,
  createGiftCards,
  createPromotions,
  generatePromotionCodes
} from '@/lib/discount-store';
import { DISCOUNT_BATCH_MAX, GIFT_CARD_MAX_CENTS, GIFT_CARD_MIN_CENTS } from '@/lib/discounts';
import { formInteger } from '@/lib/form-values';
import { sendGiftCardEmail } from '@/lib/gift-card-email';

const text = (form: FormData, name: string) => String(form.get(name) || '').trim();
const checked = (form: FormData, name: string) =>
  form.get(name) === 'on' || form.get(name) === 'true';
/** Dollars as typed into a form, as integer cents. Accepts a negative figure. */
const money = (value: FormDataEntryValue | null) => {
  const number = Number(String(value ?? '').trim());
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
};
const optionalDate = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

async function guard() {
  if (!(await isAdmin())) redirect('/admin');
}

function refresh() {
  revalidatePath('/admin/discounts');
  revalidatePath('/admin');
}

/**
 * Both of these end the request, and both say so in their type — `redirect`
 * throws — which is what lets the checks below read as guards rather than as
 * an `if` around everything that follows them.
 */
function done(query: Record<string, string | undefined>): never {
  refresh();
  redirect(adminDiscountsPath(query));
}

function fail(error: string, extra: Record<string, string | undefined> = {}): never {
  redirect(adminDiscountsPath({ error, ...extra }));
}

/**
 * The rules half of a promotion form — everything except the code itself, which
 * is what a single code and a generated batch of fifty have in common.
 *
 * Returns a refusal rather than throwing, because every one of these is
 * something Tammy typed and can fix, and a stack trace is not an answer to
 * "you meant a percentage, not four hundred percent".
 */
function readPromotionRules(formData: FormData) {
  const rawKind = text(formData, 'kind');
  const kind = Object.values(DiscountKind).includes(rawKind as DiscountKind)
    ? (rawKind as DiscountKind)
    : DiscountKind.PERCENT;
  const percentOff = formInteger(formData.get('percentOff'), 0);
  const amountOffCents = money(formData.get('amountOff'));

  if (kind === DiscountKind.PERCENT && (percentOff < 1 || percentOff > 100)) {
    return { ok: false as const, error: 'promotion-value' };
  }
  if (kind === DiscountKind.AMOUNT && amountOffCents <= 0) {
    return { ok: false as const, error: 'promotion-value' };
  }

  const startsAt = optionalDate(text(formData, 'startsAt'));
  const endsAt = optionalDate(text(formData, 'endsAt'));
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    return { ok: false as const, error: 'promotion-dates' };
  }

  const maxRedemptions = formInteger(formData.get('maxRedemptions'), 0);

  return {
    ok: true as const,
    rules: {
      label: text(formData, 'label') || null,
      kind,
      // Only the figure the chosen kind actually uses is stored. Leaving the
      // other behind is how a code edited from 20% to $5 goes on reading as
      // both in the list.
      percentOff: kind === DiscountKind.PERCENT ? percentOff : null,
      amountOffCents: kind === DiscountKind.AMOUNT ? amountOffCents : null,
      minSubtotalCents: Math.max(0, money(formData.get('minSubtotal'))),
      categoryId: text(formData, 'categoryId') || null,
      startsAt,
      endsAt,
      maxRedemptions: maxRedemptions > 0 ? maxRedemptions : null,
      active: checked(formData, 'active')
    }
  };
}

export async function savePromotion(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const code = normalizePromoCode(text(formData, 'code'));
  if (!isValidPromoCode(code)) fail('promotion-code', { promotion: id || undefined });

  const parsed = readPromotionRules(formData);
  if (!parsed.ok) fail(parsed.error, { promotion: id || undefined });

  /**
   * The write is finished before anything redirects. `redirect` works by
   * throwing, so calling it inside the `try` would put a successful save into
   * the catch below and have it re-examined as though it were a Prisma error.
   */
  let savedId: string;
  try {
    savedId = id
      ? (await db.promotion.update({ where: { id }, data: { ...parsed.rules, code } })).id
      : (await db.promotion.create({ data: { ...parsed.rules, code } })).id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2025 is "no such row"; P2002 a code that is already somebody else's.
      if (error.code === 'P2025') fail('promotion-missing');
      if (error.code === 'P2002') fail('promotion-code', { promotion: id || undefined });
    }
    throw error;
  }
  done({ notice: id ? 'promotion-saved' : 'promotion-created', promotion: savedId });
}

export async function generatePromotions(formData: FormData) {
  await guard();
  const count = Math.max(1, Math.min(DISCOUNT_BATCH_MAX, formInteger(formData.get('count'), 1)));
  const prefix = text(formData, 'prefix');
  const batch = text(formData, 'batch') || prefix || null;

  const parsed = readPromotionRules(formData);
  if (!parsed.ok) fail(parsed.error);

  const codes = await generatePromotionCodes(count, prefix);
  if (!codes.length) fail('promotion-code');

  const { created, skipped } = await createPromotions({ codes, rules: parsed.rules, batch });
  if (!created.length) fail('promotion-code');
  done({ notice: skipped.length ? 'promotions-generated-partial' : 'promotions-generated' });
}

export async function setPromotionActive(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const active = checked(formData, 'active');
  const updated = await db.promotion.updateMany({ where: { id }, data: { active } });
  if (updated.count === 0) fail('promotion-missing');
  done({ notice: active ? 'promotion-live' : 'promotion-paused', promotion: id });
}

/**
 * Deletes a code nobody has used. One that has been redeemed is refused
 * outright: its redemption rows are the shop's record of what was given away
 * and on which order, and deleting the promotion cascades them away with it.
 * Pausing has the same effect on customers and keeps the books.
 */
export async function deletePromotion(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const promotion = await db.promotion.findUnique({
    where: { id },
    select: { id: true, _count: { select: { redemptions: true, orders: true } } }
  });
  if (!promotion) fail('promotion-missing');
  if (promotion._count.redemptions > 0 || promotion._count.orders > 0) {
    fail('promotion-redeemed', { promotion: id });
  }
  await db.promotion.delete({ where: { id } });
  done({ notice: 'promotion-deleted' });
}

export async function issueGiftCards(formData: FormData) {
  await guard();
  const admin = await currentAdmin();
  const amountCents = money(formData.get('amount'));
  if (amountCents < GIFT_CARD_MIN_CENTS || amountCents > GIFT_CARD_MAX_CENTS) {
    fail('gift-card-amount');
  }

  const count = formInteger(formData.get('count'), 1);
  if (count < 1 || count > DISCOUNT_BATCH_MAX) fail('gift-card-count');

  const recipientEmail = text(formData, 'recipientEmail') || null;
  const cards = await createGiftCards({
    count,
    amountCents,
    recipientName: text(formData, 'recipientName') || null,
    recipientEmail,
    purchaserName: text(formData, 'purchaserName') || null,
    purchaserEmail: text(formData, 'purchaserEmail') || null,
    message: text(formData, 'message') || null,
    expiresAt: optionalDate(text(formData, 'expiresAt')),
    batch: text(formData, 'batch') || null,
    note: text(formData, 'note') || null,
    issuedBy: admin?.email || admin?.name || null
  });

  /**
   * Emailed only for a single named card. A batch of twenty-five for a market
   * stall has one recipient address at most by accident, and sending the same
   * person twenty-five spendable codes is not what the box means.
   */
  const first = cards[0];
  if (!checked(formData, 'sendEmail') || !first || cards.length !== 1) {
    done({ notice: 'gift-cards-created', card: first?.id });
  }
  if (!recipientEmail) fail('gift-card-recipient', { card: first.id });

  const delivery = await sendGiftCardEmail(first.id);
  if (!delivery.sent) fail('gift-card-email-failed', { card: first.id });
  done({ notice: 'gift-card-emailed', card: first.id });
}

export async function emailGiftCard(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const card = await db.giftCard.findUnique({
    where: { id },
    select: { id: true, recipientEmail: true }
  });
  if (!card) fail('gift-card-missing');
  if (!card.recipientEmail) fail('gift-card-recipient', { card: id });

  const delivery = await sendGiftCardEmail(id);
  if (!delivery.sent) fail('gift-card-email-failed', { card: id });
  done({ notice: 'gift-card-emailed', card: id });
}

export async function adjustGiftCard(formData: FormData) {
  await guard();
  const admin = await currentAdmin();
  const id = text(formData, 'id');
  const deltaCents = money(formData.get('amount'));
  if (!deltaCents) fail('gift-card-adjust', { card: id });

  const result = await adjustGiftCardBalance({
    giftCardId: id,
    deltaCents,
    note: text(formData, 'note') || null,
    issuedBy: admin?.email || admin?.name || null
  });
  if (!result) fail('gift-card-missing');
  done({ notice: 'gift-card-adjusted', card: id });
}

export async function setGiftCardActive(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const active = checked(formData, 'active');
  const updated = await db.giftCard.updateMany({ where: { id }, data: { active } });
  if (updated.count === 0) fail('gift-card-missing');
  done({ notice: active ? 'gift-card-live' : 'gift-card-paused', card: id });
}
