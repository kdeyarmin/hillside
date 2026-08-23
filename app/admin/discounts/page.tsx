import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DiscountKind, Prisma, type Category, type Promotion } from '@prisma/client';
import AdminDeepLink from '@/components/AdminDeepLink';
import ConfirmSubmit from '@/components/ConfirmSubmit';
import PendingSubmit from '@/components/PendingSubmit';
import { isAdmin } from '@/lib/admin';
import { ADMIN_ERRORS, ADMIN_NOTICES, firstSearchParam } from '@/lib/admin-dashboard';
import { db } from '@/lib/db';
import { maskGiftCardCode } from '@/lib/discount-codes';
import {
  DISCOUNT_BATCH_MAX,
  DISCOUNT_KIND_LABELS,
  DISCOUNT_PAGE_SIZE,
  giftCardSearchTerms,
  GIFT_CARD_ENTRY_LABELS,
  GIFT_CARD_MAX_CENTS,
  GIFT_CARD_MIN_CENTS,
  giftCardEntryMovementCents,
  promotionSummary
} from '@/lib/discounts';
import { formatMoney } from '@/lib/store';
import {
  adjustGiftCard,
  deletePromotion,
  emailGiftCard,
  generatePromotions,
  issueGiftCards,
  savePromotion,
  setGiftCardActive,
  setPromotionActive
} from '../discount-actions';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Gift cards & promo codes',
  robots: { index: false, follow: false }
};

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` and refuses anything else. */
function dateTimeValue(value: Date | null) {
  if (!value) return '';
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function dateValue(value: Date | null) {
  return value ? dateTimeValue(value).slice(0, 10) : '';
}

/** A link back to this page at another page of cards, keeping the search. */
function cardPageHref(query: string, page: number) {
  const params = new URLSearchParams();
  if (query) params.set('cards', query);
  if (page > 1) params.set('page', String(page));
  const encoded = params.toString();
  return `/admin/discounts${encoded ? `?${encoded}` : ''}#gift-cards`;
}

/**
 * The rule fields a promotion is made of, shared by the single-code form and
 * the batch generator so the two cannot start offering different rules.
 */
function PromotionRuleFields({
  promotion,
  categories,
  idPrefix
}: {
  promotion?: Promotion;
  categories: Pick<Category, 'id' | 'title'>[];
  idPrefix: string;
}) {
  return (
    <div className="admin-form-grid">
      <label className="admin-label" htmlFor={`${idPrefix}-kind`}>
        What it takes off
        <select
          id={`${idPrefix}-kind`}
          className="admin-input"
          name="kind"
          defaultValue={promotion?.kind || DiscountKind.PERCENT}
        >
          {Object.values(DiscountKind).map((kind) => (
            <option value={kind} key={kind}>
              {DISCOUNT_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
        <span className="admin-hint">
          Fill in the box below that matches. Free shipping ignores both.
        </span>
      </label>
      <label className="admin-label" htmlFor={`${idPrefix}-percentOff`}>
        Percentage off
        <input
          id={`${idPrefix}-percentOff`}
          className="admin-input"
          name="percentOff"
          type="number"
          min={1}
          max={100}
          step={1}
          defaultValue={promotion?.percentOff ?? ''}
          placeholder="20"
        />
      </label>
      <label className="admin-label" htmlFor={`${idPrefix}-amountOff`}>
        Amount off ($)
        <input
          id={`${idPrefix}-amountOff`}
          className="admin-input"
          name="amountOff"
          type="number"
          min={0}
          step="0.01"
          defaultValue={promotion?.amountOffCents ? promotion.amountOffCents / 100 : ''}
          placeholder="5.00"
        />
      </label>
      <label className="admin-label" htmlFor={`${idPrefix}-minSubtotal`}>
        Only on orders of at least ($)
        <input
          id={`${idPrefix}-minSubtotal`}
          className="admin-input"
          name="minSubtotal"
          type="number"
          min={0}
          step="0.01"
          defaultValue={promotion?.minSubtotalCents ? promotion.minSubtotalCents / 100 : ''}
          placeholder="0.00"
        />
        <span className="admin-hint">Measured against the plants and goods, before shipping.</span>
      </label>
      <label className="admin-label" htmlFor={`${idPrefix}-categoryId`}>
        Only on
        <select
          id={`${idPrefix}-categoryId`}
          className="admin-input"
          name="categoryId"
          defaultValue={promotion?.categoryId || ''}
        >
          <option value="">Everything in the shop</option>
          {categories.map((category) => (
            <option value={category.id} key={category.id}>
              {category.title}
            </option>
          ))}
        </select>
        <span className="admin-hint">
          A category code takes nothing off the rest of the basket — &ldquo;20% off teas&rdquo;
          leaves the pot beside it at full price.
        </span>
      </label>
      <label className="admin-label" htmlFor={`${idPrefix}-maxRedemptions`}>
        Total redemptions allowed
        <input
          id={`${idPrefix}-maxRedemptions`}
          className="admin-input"
          name="maxRedemptions"
          type="number"
          min={0}
          step={1}
          defaultValue={promotion?.maxRedemptions ?? ''}
          placeholder="Leave empty for unlimited"
        />
      </label>
      <label className="admin-label" htmlFor={`${idPrefix}-startsAt`}>
        Starts
        <input
          id={`${idPrefix}-startsAt`}
          className="admin-input"
          name="startsAt"
          type="datetime-local"
          defaultValue={dateTimeValue(promotion?.startsAt ?? null)}
        />
      </label>
      <label className="admin-label" htmlFor={`${idPrefix}-endsAt`}>
        Ends
        <input
          id={`${idPrefix}-endsAt`}
          className="admin-input"
          name="endsAt"
          type="datetime-local"
          defaultValue={dateTimeValue(promotion?.endsAt ?? null)}
        />
        <span className="admin-hint">Leave both empty for a code with no dates on it.</span>
      </label>
      <label className="admin-label full" htmlFor={`${idPrefix}-label`}>
        What it is for (only you see this)
        <input
          id={`${idPrefix}-label`}
          className="admin-input"
          name="label"
          defaultValue={promotion?.label || ''}
          placeholder="Spring open house handout"
        />
      </label>
    </div>
  );
}

export default async function AdminDiscounts({
  searchParams
}: {
  searchParams: Promise<{
    notice?: string | string[];
    error?: string | string[];
    promotion?: string | string[];
    card?: string | string[];
    section?: string | string[];
    cards?: string | string[];
    page?: string | string[];
  }>;
}) {
  if (!(await isAdmin())) redirect('/admin');
  const params = await searchParams;
  const notice = ADMIN_NOTICES[firstSearchParam(params.notice)];
  const errorMessage = ADMIN_ERRORS[firstSearchParam(params.error)];
  const focusPromotion = firstSearchParam(params.promotion);
  const focusCard = firstSearchParam(params.card);
  const focusSection = firstSearchParam(params.section);
  const cardQuery = firstSearchParam(params.cards).trim();
  const cardPage = Math.max(1, Number(firstSearchParam(params.page)) || 1);

  /**
   * Cards are searched in the database rather than filtered after the fact.
   *
   * One batch may itself issue a hundred cards, so a page that read the newest
   * hundred and filtered those would lose every older card the moment a batch
   * went out — and a card nobody can find is a card the owner cannot put on
   * hold when it is lost. The code is matched on its bare characters so a
   * number read off a slip finds its row with or without the printed hyphens.
   */
  const cardWhere: Prisma.GiftCardWhereInput = cardQuery
    ? {
        OR: [
          ...giftCardSearchTerms(cardQuery).map((term) => ({
            code: { contains: term, mode: 'insensitive' as const }
          })),
          { recipientName: { contains: cardQuery, mode: 'insensitive' as const } },
          { recipientEmail: { contains: cardQuery, mode: 'insensitive' as const } },
          { purchaserName: { contains: cardQuery, mode: 'insensitive' as const } },
          { purchaserEmail: { contains: cardQuery, mode: 'insensitive' as const } },
          { batch: { contains: cardQuery, mode: 'insensitive' as const } },
          { note: { contains: cardQuery, mode: 'insensitive' as const } }
        ]
      }
    : {};

  const [promotions, giftCards, cardCount, categories, redeemed, outstanding] = await Promise.all([
    db.promotion.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        category: { select: { title: true } },
        _count: { select: { redemptions: true } }
      }
    }),
    db.giftCard.findMany({
      where: cardWhere,
      orderBy: { createdAt: 'desc' },
      skip: (cardPage - 1) * DISCOUNT_PAGE_SIZE,
      take: DISCOUNT_PAGE_SIZE,
      include: { entries: { orderBy: { createdAt: 'desc' }, take: 15 } }
    }),
    db.giftCard.count({ where: cardWhere }),
    db.category.findMany({
      where: { active: true },
      orderBy: { title: 'asc' },
      select: { id: true, title: true }
    }),
    db.promotionRedemption.aggregate({ _sum: { amountCents: true }, _count: true }),
    /**
     * What the shop still owes on cards it has issued: the spendable balances
     * plus the money open checkouts are holding, because a hold that is not
     * paid for comes straight back to the customer. Cards switched off are left
     * out — that is what switching one off means.
     */
    db.giftCard.aggregate({
      _sum: { balanceCents: true, reservedCents: true },
      where: { active: true }
    })
  ]);

  const cardPages = Math.max(1, Math.ceil(cardCount / DISCOUNT_PAGE_SIZE));
  const liveCodes = promotions.filter((promotion) => promotion.active).length;
  const outstandingCents =
    (outstanding._sum.balanceCents || 0) + (outstanding._sum.reservedCents || 0);

  return (
    <div className="adminshell">
      <AdminDeepLink
        section={focusSection || undefined}
        focusId={
          (focusPromotion && `promotion-${focusPromotion}`) ||
          (focusCard && `card-${focusCard}`) ||
          undefined
        }
      />
      <aside className="sidebar">
        <img src="/logo.webp" alt="The Hillside Gardens" />
        <b>Gift Cards &amp; Promo Codes</b>
        <Link href="/admin">← Business dashboard</Link>
        <a href="#promotions">Promo codes</a>
        <a href="#new-promotion">Create a code</a>
        <a href="#generate-promotions">Generate a batch</a>
        <a href="#gift-cards">Gift cards</a>
        <a href="#new-gift-card">Issue gift cards</a>
        <Link href="/admin/email">Email</Link>
        <Link href="/">View public website</Link>
      </aside>

      <div className="adminmain">
        <div className="eyebrow">Discounts</div>
        <h1>Gift cards &amp; promo codes</h1>
        <p className="muted">
          Both are entered by the customer in their basket, and both are checked against the real
          order before anything is charged. A promo code is a discount you are giving; a gift card
          is money somebody already holds, spent down over as many orders as it takes.
        </p>

        {notice && (
          <div className="admin-card admin-notice" role="status">
            <b>{notice}</b>
          </div>
        )}
        {errorMessage && (
          <div className="admin-card admin-alert" role="alert">
            <b>{errorMessage}</b>
          </div>
        )}

        <div className="statgrid">
          <div className="stat">
            <span>Codes being accepted</span>
            <strong>{liveCodes}</strong>
          </div>
          <div className="stat">
            <span>Codes altogether</span>
            <strong>{promotions.length}</strong>
          </div>
          <div className="stat">
            <span>Discount given</span>
            <strong>{formatMoney(redeemed._sum.amountCents || 0)}</strong>
          </div>
          <div className="stat">
            <span>Codes redeemed</span>
            <strong>{redeemed._count}</strong>
          </div>
          <div className="stat">
            <span>Gift cards live</span>
            <strong>{giftCards.filter((card) => card.active).length}</strong>
          </div>
          <div className="stat">
            <span>Still on gift cards</span>
            <strong>{formatMoney(outstandingCents)}</strong>
          </div>
        </div>

        <section className="admin-section" id="promotions">
          <h2>Promo codes</h2>
          <p className="muted">
            A code works the moment it is created. Pausing one stops it being accepted straight
            away, without touching the orders that already used it.
          </p>

          {promotions.length ? (
            <div className="admin-list">
              {promotions.map((promotion) => {
                const held = promotion.redemptionsUsed - promotion._count.redemptions;
                return (
                  <details
                    key={promotion.id}
                    id={`promotion-${promotion.id}`}
                    open={promotion.id === focusPromotion}
                  >
                    <summary>
                      <span>
                        <b>{promotion.code}</b> •{' '}
                        {promotionSummary(promotion, {
                          categoryTitle: promotion.category?.title,
                          formatCents: formatMoney
                        })}
                        {promotion.label ? ` • ${promotion.label}` : ''}
                      </span>
                      <span className={`status-badge ${promotion.active ? 'PAID' : 'CANCELLED'}`}>
                        {promotion.active ? 'Accepting' : 'Paused'}
                      </span>
                    </summary>
                    <div>
                      <p className="muted">
                        Used {promotion._count.redemptions}
                        {promotion.maxRedemptions ? ` of ${promotion.maxRedemptions}` : ' times'}
                        {held > 0
                          ? ` • ${held} more held by ${held === 1 ? 'a checkout that is' : 'checkouts that are'} still open`
                          : ''}
                        {promotion.minSubtotalCents
                          ? ` • orders of ${formatMoney(promotion.minSubtotalCents)} and up`
                          : ''}
                        {promotion.startsAt
                          ? ` • from ${promotion.startsAt.toLocaleDateString()}`
                          : ''}
                        {promotion.endsAt
                          ? ` • until ${promotion.endsAt.toLocaleDateString()}`
                          : ''}
                        {promotion.batch ? ` • batch “${promotion.batch}”` : ''}
                      </p>
                      <form action={savePromotion}>
                        <input type="hidden" name="id" value={promotion.id} />
                        <div className="admin-form-grid">
                          <label className="admin-label" htmlFor={`code-${promotion.id}`}>
                            Code
                            <input
                              id={`code-${promotion.id}`}
                              className="admin-input"
                              name="code"
                              defaultValue={promotion.code}
                              required
                            />
                          </label>
                        </div>
                        <PromotionRuleFields
                          promotion={promotion}
                          categories={categories}
                          idPrefix={promotion.id}
                        />
                        <div className="admin-actions">
                          <label className="admin-checkbox">
                            <input
                              type="checkbox"
                              name="active"
                              defaultChecked={promotion.active}
                            />{' '}
                            Accept this code in the shop
                          </label>
                          <PendingSubmit className="btn small" pendingLabel="Saving…">
                            Save code
                          </PendingSubmit>
                        </div>
                      </form>
                      <div className="admin-actions">
                        <form action={setPromotionActive}>
                          <input type="hidden" name="id" value={promotion.id} />
                          <input
                            type="hidden"
                            name="active"
                            value={promotion.active ? 'false' : 'true'}
                          />
                          <button className="btn outline small">
                            {promotion.active ? 'Pause this code' : 'Start accepting it again'}
                          </button>
                        </form>
                        {promotion._count.redemptions === 0 && (
                          <form action={deletePromotion}>
                            <input type="hidden" name="id" value={promotion.id} />
                            <ConfirmSubmit
                              className="btn danger small"
                              message={`Delete ${promotion.code}? Nobody has used it, so nothing is lost.`}
                            >
                              Delete
                            </ConfirmSubmit>
                          </form>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          ) : (
            <div className="admin-card">
              <p>No promo codes yet. Create one below and it works in the cart immediately.</p>
            </div>
          )}
        </section>

        <section className="admin-section" id="new-promotion">
          <h2>Create a code</h2>
          <div className="admin-card">
            <form action={savePromotion}>
              <div className="admin-form-grid">
                <label className="admin-label" htmlFor="new-promotion-code">
                  Code
                  <input
                    id="new-promotion-code"
                    className="admin-input"
                    name="code"
                    required
                    placeholder="SPRING20"
                    autoCapitalize="characters"
                    spellCheck={false}
                  />
                  <span className="admin-hint">
                    Letters, numbers, hyphens. Customers may type it in any case.
                  </span>
                </label>
              </div>
              <PromotionRuleFields categories={categories} idPrefix="new-promotion" />
              <div className="admin-actions">
                <label className="admin-checkbox">
                  <input type="checkbox" name="active" defaultChecked /> Accept this code in the
                  shop
                </label>
                <PendingSubmit className="btn small" pendingLabel="Creating…">
                  Create code
                </PendingSubmit>
              </div>
            </form>
          </div>
        </section>

        <section className="admin-section" id="generate-promotions">
          <h2>Generate a batch</h2>
          <p className="muted">
            For printed slips and market handouts: one set of rules, but every customer gets a code
            of their own, so a single-use code stays single-use per person.
          </p>
          <div className="admin-card">
            <form action={generatePromotions}>
              <div className="admin-form-grid">
                <label className="admin-label" htmlFor="generate-count">
                  How many
                  <input
                    id="generate-count"
                    className="admin-input"
                    name="count"
                    type="number"
                    min={1}
                    max={DISCOUNT_BATCH_MAX}
                    defaultValue={25}
                    required
                  />
                  <span className="admin-hint">Up to {DISCOUNT_BATCH_MAX} at a time.</span>
                </label>
                <label className="admin-label" htmlFor="generate-prefix">
                  Start each code with
                  <input
                    id="generate-prefix"
                    className="admin-input"
                    name="prefix"
                    placeholder="MARKET"
                    autoCapitalize="characters"
                    spellCheck={false}
                  />
                  <span className="admin-hint">
                    Optional. MARKET becomes MARKET-7KQ2WD, MARKET-3PJXVA and so on.
                  </span>
                </label>
                <label className="admin-label" htmlFor="generate-batch">
                  Batch name
                  <input
                    id="generate-batch"
                    className="admin-input"
                    name="batch"
                    placeholder="Spring market 2026"
                  />
                  <span className="admin-hint">Only you see this. It groups the codes below.</span>
                </label>
              </div>
              <PromotionRuleFields categories={categories} idPrefix="generate" />
              <div className="admin-actions">
                <label className="admin-checkbox">
                  <input type="checkbox" name="active" defaultChecked /> Accept them straight away
                </label>
                <PendingSubmit className="btn small" pendingLabel="Generating…">
                  Generate codes
                </PendingSubmit>
              </div>
            </form>
          </div>
        </section>

        <section className="admin-section" id="gift-cards">
          <h2>Gift cards</h2>
          <p className="muted">
            The number on a card is what spends it, so it is shown in full only when you open a
            card. Money is moved aside while a checkout is open and only taken when the order is
            paid — an abandoned basket puts it straight back.
          </p>

          {/* A GET form, so a search is a link Tammy can bookmark or send to
              herself, and so it works with no JavaScript at all. */}
          <form className="admin-card discount-search" method="get" action="/admin/discounts">
            <input type="hidden" name="section" value="gift-cards" />
            <label className="admin-label" htmlFor="card-search">
              Find a card
              <span className="admin-hint">
                By its number — with or without the dashes — or by who it was for, who bought it,
                its batch or your own note.
              </span>
            </label>
            <div className="discount-search-row">
              <input
                id="card-search"
                className="admin-input"
                name="cards"
                defaultValue={cardQuery}
                placeholder="M3QA, marion@example.com, Holiday cards 2026"
                autoComplete="off"
              />
              <button className="btn small">Search</button>
              {cardQuery && (
                <Link className="btn outline small" href="/admin/discounts#gift-cards">
                  Clear
                </Link>
              )}
            </div>
          </form>

          {giftCards.length ? (
            <div className="admin-list">
              {giftCards.map((card) => {
                const spent = card.initialCents - card.balanceCents - card.reservedCents;
                return (
                  <details key={card.id} id={`card-${card.id}`} open={card.id === focusCard}>
                    <summary>
                      <span>
                        <b>{maskGiftCardCode(card.code)}</b> • {formatMoney(card.balanceCents)} left
                        of {formatMoney(card.initialCents)}
                        {card.recipientName || card.recipientEmail
                          ? ` • ${card.recipientName || card.recipientEmail}`
                          : ''}
                      </span>
                      <span
                        className={`status-badge ${
                          !card.active ? 'CANCELLED' : card.balanceCents > 0 ? 'PAID' : 'NEW'
                        }`}
                      >
                        {!card.active ? 'On hold' : card.balanceCents > 0 ? 'Spendable' : 'Spent'}
                      </span>
                    </summary>
                    <div>
                      <p>
                        <b className="gift-card-code">{card.code}</b>
                      </p>
                      <p className="muted">
                        Issued {card.createdAt.toLocaleDateString()}
                        {card.issuedBy ? ` by ${card.issuedBy}` : ''}
                        {card.expiresAt ? ` • expires ${card.expiresAt.toLocaleDateString()}` : ''}
                        {card.batch ? ` • batch “${card.batch}”` : ''}
                        {card.reservedCents > 0
                          ? ` • ${formatMoney(card.reservedCents)} held by an open checkout`
                          : ''}
                        {spent > 0 ? ` • ${formatMoney(spent)} spent` : ''}
                        {card.lastSentAt
                          ? ` • emailed ${card.lastSentAt.toLocaleDateString()}`
                          : card.recipientEmail
                            ? ' • not emailed yet'
                            : ''}
                      </p>
                      {card.recipientEmail && (
                        <p className="muted">
                          For {card.recipientName || 'the recipient'} at{' '}
                          <a className="text-link" href={`mailto:${card.recipientEmail}`}>
                            {card.recipientEmail}
                          </a>
                          {card.purchaserName ? `, from ${card.purchaserName}` : ''}
                        </p>
                      )}
                      {card.note && <p className="muted">Note: {card.note}</p>}

                      <div className="admin-actions">
                        {card.recipientEmail && (
                          <form action={emailGiftCard}>
                            <input type="hidden" name="id" value={card.id} />
                            <PendingSubmit className="btn outline small" pendingLabel="Sending…">
                              {card.lastSentAt ? 'Send it again' : 'Email it to them'}
                            </PendingSubmit>
                          </form>
                        )}
                        <form action={setGiftCardActive}>
                          <input type="hidden" name="id" value={card.id} />
                          <input
                            type="hidden"
                            name="active"
                            value={card.active ? 'false' : 'true'}
                          />
                          <button className="btn outline small">
                            {card.active ? 'Put on hold' : 'Make spendable again'}
                          </button>
                        </form>
                      </div>

                      <form action={adjustGiftCard} className="admin-form-grid">
                        <input type="hidden" name="id" value={card.id} />
                        <label className="admin-label" htmlFor={`adjust-${card.id}`}>
                          Add or take off ($)
                          <input
                            id={`adjust-${card.id}`}
                            className="admin-input"
                            name="amount"
                            type="number"
                            step="0.01"
                            placeholder="10.00 or -10.00"
                          />
                          <span className="admin-hint">
                            A negative figure takes money off. It cannot take a card below zero, and
                            it never touches money an open checkout is holding.
                          </span>
                        </label>
                        <label className="admin-label" htmlFor={`adjust-note-${card.id}`}>
                          Why
                          <input
                            id={`adjust-note-${card.id}`}
                            className="admin-input"
                            name="note"
                            placeholder="Goodwill for the broken pot"
                          />
                        </label>
                        <div className="admin-actions full">
                          <PendingSubmit className="btn small" pendingLabel="Updating…">
                            Update balance
                          </PendingSubmit>
                        </div>
                      </form>

                      {card.entries.length > 0 && (
                        <div className="table-wrap">
                          <table className="table">
                            <thead>
                              <tr>
                                <th>When</th>
                                <th>What happened</th>
                                <th>Amount</th>
                                <th>Balance after</th>
                                <th>Note</th>
                              </tr>
                            </thead>
                            <tbody>
                              {card.entries.map((entry) => {
                                const movement = giftCardEntryMovementCents(entry);
                                return (
                                  <tr key={entry.id}>
                                    <td>{entry.createdAt.toLocaleDateString()}</td>
                                    <td>{GIFT_CARD_ENTRY_LABELS[entry.kind] || entry.kind}</td>
                                    <td>
                                      {movement >= 0 ? '+' : '−'}
                                      {formatMoney(Math.abs(movement))}
                                    </td>
                                    <td>{formatMoney(entry.balanceAfterCents)}</td>
                                    <td>{entry.note || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          ) : (
            <div className="admin-card">
              <p>
                {cardQuery
                  ? `Nothing matches “${cardQuery}”. Try the last four characters of the number on its own.`
                  : 'No gift cards issued yet.'}
              </p>
            </div>
          )}

          {cardPages > 1 && (
            <div className="admin-actions discount-pager">
              <span className="muted">
                {cardCount} {cardCount === 1 ? 'card' : 'cards'}
                {cardQuery ? ' matching' : ''} • page {cardPage} of {cardPages}
              </span>
              {cardPage > 1 && (
                <Link
                  className="btn outline small"
                  href={cardPageHref(cardQuery, cardPage - 1)}
                  rel="prev"
                >
                  ← Newer
                </Link>
              )}
              {cardPage < cardPages && (
                <Link
                  className="btn outline small"
                  href={cardPageHref(cardQuery, cardPage + 1)}
                  rel="next"
                >
                  Older →
                </Link>
              )}
            </div>
          )}
        </section>

        <section className="admin-section" id="new-gift-card">
          <h2>Issue gift cards</h2>
          <p className="muted">
            One for a customer who asked, or a batch to write out by hand. Every card gets a number
            of its own that nobody can guess, and this page is the only other place it exists — so
            if a card is lost, put it on hold here and issue a new one.
          </p>
          <div className="admin-card">
            <form action={issueGiftCards}>
              <div className="admin-form-grid">
                <label className="admin-label" htmlFor="gift-amount">
                  Amount on each card ($)
                  <input
                    id="gift-amount"
                    className="admin-input"
                    name="amount"
                    type="number"
                    min={GIFT_CARD_MIN_CENTS / 100}
                    max={GIFT_CARD_MAX_CENTS / 100}
                    step="0.01"
                    defaultValue={25}
                    required
                  />
                  <span className="admin-hint">
                    Between {formatMoney(GIFT_CARD_MIN_CENTS)} and{' '}
                    {formatMoney(GIFT_CARD_MAX_CENTS)}.
                  </span>
                </label>
                <label className="admin-label" htmlFor="gift-count">
                  How many
                  <input
                    id="gift-count"
                    className="admin-input"
                    name="count"
                    type="number"
                    min={1}
                    max={DISCOUNT_BATCH_MAX}
                    defaultValue={1}
                    required
                  />
                </label>
                <label className="admin-label" htmlFor="gift-expires">
                  Expires
                  <input
                    id="gift-expires"
                    className="admin-input"
                    name="expiresAt"
                    type="date"
                    defaultValue={dateValue(null)}
                  />
                  <span className="admin-hint">Leave empty for a card that does not expire.</span>
                </label>
                <label className="admin-label" htmlFor="gift-recipient-name">
                  Recipient&rsquo;s name
                  <input
                    id="gift-recipient-name"
                    className="admin-input"
                    name="recipientName"
                    placeholder="Marion"
                  />
                </label>
                <label className="admin-label" htmlFor="gift-recipient-email">
                  Recipient&rsquo;s email
                  <input
                    id="gift-recipient-email"
                    className="admin-input"
                    name="recipientEmail"
                    type="email"
                    placeholder="marion@example.com"
                  />
                </label>
                <label className="admin-label" htmlFor="gift-purchaser-name">
                  From
                  <input
                    id="gift-purchaser-name"
                    className="admin-input"
                    name="purchaserName"
                    placeholder="Ellen"
                  />
                </label>
                <label className="admin-label" htmlFor="gift-purchaser-email">
                  Buyer&rsquo;s email
                  <input
                    id="gift-purchaser-email"
                    className="admin-input"
                    name="purchaserEmail"
                    type="email"
                    placeholder="ellen@example.com"
                  />
                </label>
                <label className="admin-label" htmlFor="gift-batch">
                  Batch name
                  <input
                    id="gift-batch"
                    className="admin-input"
                    name="batch"
                    placeholder="Holiday cards 2026"
                  />
                </label>
                <label className="admin-label full" htmlFor="gift-message">
                  Message to the recipient
                  <textarea
                    id="gift-message"
                    className="admin-input"
                    name="message"
                    rows={2}
                    placeholder="Happy birthday — pick something green."
                  />
                  <span className="admin-hint">Included in the email, if you send one.</span>
                </label>
                <label className="admin-label full" htmlFor="gift-note">
                  Your own note
                  <input
                    id="gift-note"
                    className="admin-input"
                    name="note"
                    placeholder="Paid cash at the market"
                  />
                </label>
              </div>
              <div className="admin-actions">
                <label className="admin-checkbox">
                  <input type="checkbox" name="sendEmail" /> Email it to the recipient now
                  <span className="admin-hint">
                    Only for a single card with an email address on it. A batch is never emailed.
                  </span>
                </label>
                <PendingSubmit className="btn small" pendingLabel="Issuing…">
                  Issue
                </PendingSubmit>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
