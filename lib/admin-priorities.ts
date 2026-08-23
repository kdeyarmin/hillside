/**
 * What the dashboard leads with.
 *
 * The old overview was ten counters in a row — revenue, active products,
 * archived products — most of which are not things anyone can act on. This
 * builds the opposite: a list of the jobs that are actually waiting, ordered by
 * how much they cost to leave undone, with the ones at zero left out entirely.
 *
 * A card that reads "0" is not reassurance, it is noise between Tammy and the
 * two that say 3. The board says "nothing waiting" once, when that is true.
 *
 * Pure, so the ordering and the wording are covered by `npm test`.
 */

import { adminDashboardPath } from './admin-dashboard.ts';

/**
 * How loudly a card speaks. `urgent` is money or a customer already waiting;
 * `attention` is work that will cost a sale soon; `calm` is upkeep.
 */
export type PriorityTone = 'urgent' | 'attention' | 'calm';

export type PriorityCard = {
  key: string;
  label: string;
  count: number;
  /** One line saying what doing it involves. */
  detail: string;
  /** The word the count is in, for the accessible name. */
  unit: string;
  href: string;
  tone: PriorityTone;
};

export type PriorityCounts = {
  ordersToFulfil: number;
  pickupsToPrepare: number;
  undeliveredEmails: number;
  newMessages: number;
  customPlanterRequests: number;
  outOfStock: number;
  needsReorder: number;
  backInStockDemand: number;
  reviewsToApprove: number;
  reviewRequestsDue: number;
  missingPhotos: number;
  incompleteProducts: number;
};

export const EMPTY_PRIORITY_COUNTS: PriorityCounts = {
  ordersToFulfil: 0,
  pickupsToPrepare: 0,
  undeliveredEmails: 0,
  newMessages: 0,
  customPlanterRequests: 0,
  outOfStock: 0,
  needsReorder: 0,
  backInStockDemand: 0,
  reviewsToApprove: 0,
  reviewRequestsDue: 0,
  missingPhotos: 0,
  incompleteProducts: 0
};

/**
 * The running order, and the reasoning behind it. Anything with a customer at
 * the other end of it comes before anything that is only about the catalog.
 */
const DEFINITIONS: Array<{
  key: keyof PriorityCounts;
  label: string;
  unit: string;
  tone: PriorityTone;
  detail: (count: number) => string;
  href: string;
}> = [
  {
    key: 'ordersToFulfil',
    label: 'Orders to pack',
    unit: 'orders',
    tone: 'urgent',
    detail: (count) =>
      count === 1 ? 'One paid order is waiting to go out.' : 'Paid orders waiting to go out.',
    href: adminDashboardPath({ section: 'orders', orders: 'awaiting' })
  },
  {
    key: 'pickupsToPrepare',
    label: 'Pickups to prepare',
    unit: 'orders',
    tone: 'urgent',
    detail: () => 'Set the pickup window and the customer is emailed it.',
    href: adminDashboardPath({ section: 'orders', orders: 'pickup' })
  },
  {
    key: 'undeliveredEmails',
    label: 'Confirmations that failed',
    unit: 'orders',
    tone: 'urgent',
    detail: () => 'These customers were charged and never got their receipt.',
    href: adminDashboardPath({ section: 'orders' })
  },
  {
    key: 'customPlanterRequests',
    label: 'Custom planter requests',
    unit: 'requests',
    tone: 'urgent',
    detail: () => 'Someone is asking you to make something. Reply before they ask elsewhere.',
    href: adminDashboardPath({ section: 'messages', messages: 'planter' })
  },
  {
    key: 'newMessages',
    label: 'New messages',
    unit: 'messages',
    tone: 'attention',
    detail: () => 'Unread notes from the contact form.',
    href: adminDashboardPath({ section: 'messages' })
  },
  {
    key: 'outOfStock',
    label: 'Listed but sold out',
    unit: 'products',
    tone: 'attention',
    detail: () => 'On the shop with nothing to sell. Restock or archive.',
    href: adminDashboardPath({ section: 'inventory', stock: 'out' })
  },
  {
    key: 'backInStockDemand',
    label: 'Waiting on a restock',
    unit: 'people',
    tone: 'attention',
    detail: () => 'They are emailed automatically the moment the count goes above zero.',
    href: adminDashboardPath({ section: 'restock' })
  },
  {
    key: 'needsReorder',
    label: 'Running low',
    unit: 'products',
    tone: 'attention',
    detail: () => 'Three or fewer left — of the whole product, or of one size.',
    href: adminDashboardPath({ section: 'inventory', stock: 'low' })
  },
  {
    key: 'reviewsToApprove',
    label: 'Reviews to approve',
    unit: 'reviews',
    tone: 'attention',
    detail: () => 'Nothing is published until you have read it.',
    href: adminDashboardPath({ section: 'reviews' })
  },
  {
    key: 'reviewRequestsDue',
    label: 'Reviews to ask for',
    unit: 'orders',
    tone: 'calm',
    detail: () => 'Delivered a fortnight ago and never asked. One email each, once.',
    href: adminDashboardPath({ section: 'review-requests' })
  },
  {
    key: 'missingPhotos',
    label: 'Needing a photograph',
    unit: 'products',
    tone: 'calm',
    detail: () => 'Showing shared catalog artwork instead of the real thing.',
    href: adminDashboardPath({ section: 'inventory', stock: 'photo' })
  },
  {
    key: 'incompleteProducts',
    label: 'Missing information',
    unit: 'products',
    tone: 'calm',
    detail: () => 'No blurb, no details or no item number. Thin listings sell badly.',
    href: adminDashboardPath({ section: 'inventory', stock: 'incomplete' })
  }
];

/** Only the jobs that are actually waiting, most costly to ignore first. */
export function buildPriorityCards(counts: Partial<PriorityCounts>): PriorityCard[] {
  return DEFINITIONS.filter((definition) => (counts[definition.key] || 0) > 0).map((definition) => {
    const count = counts[definition.key] || 0;
    return {
      key: definition.key,
      label: definition.label,
      count,
      detail: definition.detail(count),
      unit: count === 1 ? definition.unit.replace(/s$/, '') : definition.unit,
      href: definition.href,
      tone: definition.tone
    };
  });
}

/** How many jobs are waiting, for the heading above the board. */
export function priorityTotal(cards: readonly PriorityCard[]) {
  return cards.reduce((total, card) => total + card.count, 0);
}

/**
 * The one-line answer to "what does today look like?", written from the board
 * rather than from a separate count so the two can never disagree.
 */
export function prioritySummary(cards: readonly PriorityCard[]) {
  if (!cards.length) return 'Nothing is waiting on you. The shop is in good order.';
  const urgent = cards.filter((card) => card.tone === 'urgent');
  if (urgent.length) {
    const first = urgent[0];
    return `Start with ${first.count} ${first.unit} — ${first.label.toLowerCase()}.`;
  }
  return `${cards.length} ${cards.length === 1 ? 'thing' : 'things'} to pick up when you have a moment.`;
}
