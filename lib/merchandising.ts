/**
 * The rules behind every automatic label the shop puts on a product — new,
 * best seller, in season — and the badges those labels turn into.
 *
 * Deliberately free of Prisma and Next so `npm test` can cover them: these are
 * the decisions a shopper reads as a promise ("this is one of our best sellers")
 * and the ones Tammy overrules by hand, so getting them wrong is visible on the
 * shelf rather than in a log. The queries that feed them live in
 * `lib/merchandising-data.ts`.
 */

export type MerchandisingMode = 'AUTO' | 'ALWAYS' | 'NEVER';

/** How long a product counts as new when nobody has said otherwise. */
export const NEW_ARRIVAL_DAYS = 45;

/**
 * Best-seller thresholds. All three are the answer to the same worry: one
 * isolated sale is not evidence of anything.
 *
 * - the window means the label lapses when a product stops selling, rather than
 *   sticking to a piece that had a good month last spring;
 * - the order floor means one customer buying six of something for a wedding
 *   does not make it a best seller;
 * - the unit floor means two idle purchases do not either.
 */
export const BEST_SELLER_WINDOW_DAYS = 120;
export const BEST_SELLER_MIN_UNITS = 4;
export const BEST_SELLER_MIN_ORDERS = 2;

/** What "recently" means for the recent-best-sellers row. */
export const RECENT_BEST_SELLER_DAYS = 30;

export type BestSellerStat = {
  /** Units sold across paid orders inside the window. */
  units: number;
  /** How many separate orders those units came from. */
  orders: number;
  lastSoldAt?: Date | string | null;
};

export type MerchandisableProduct = {
  createdAt?: Date | string | null;
  newArrivalMode?: MerchandisingMode | null;
  bestSellerMode?: MerchandisingMode | null;
  seasonStartsAt?: Date | string | null;
  seasonEndsAt?: Date | string | null;
  staffPick?: boolean | null;
  featured?: boolean | null;
  badge?: string | null;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / 86_400_000;
}

/**
 * Listed recently, or pinned. `ALWAYS` is for the piece that arrived while the
 * shop was between photographs and only went live weeks after it landed.
 */
export function isNewArrival(product: MerchandisableProduct, now = new Date()): boolean {
  if (product.newArrivalMode === 'ALWAYS') return true;
  if (product.newArrivalMode === 'NEVER') return false;
  const created = asDate(product.createdAt);
  if (!created) return false;
  const age = daysBetween(created, now);
  // A future-dated row (a clock skew, an imported record) is not "new", but it
  // is not old either — treat anything not yet in the past as newly listed.
  return age <= NEW_ARRIVAL_DAYS;
}

/** Whether the sales behind a product clear every threshold above. */
export function qualifiesAsBestSeller(stat: BestSellerStat | null | undefined): boolean {
  if (!stat) return false;
  return stat.units >= BEST_SELLER_MIN_UNITS && stat.orders >= BEST_SELLER_MIN_ORDERS;
}

export function isBestSeller(
  product: MerchandisableProduct,
  stat: BestSellerStat | null | undefined
): boolean {
  if (product.bestSellerMode === 'ALWAYS') return true;
  if (product.bestSellerMode === 'NEVER') return false;
  return qualifiesAsBestSeller(stat);
}

/** Sold at all inside the recent window — the "moving right now" row. */
export function soldRecently(stat: BestSellerStat | null | undefined, now = new Date()): boolean {
  const last = asDate(stat?.lastSoldAt);
  if (!last) return false;
  return daysBetween(last, now) <= RECENT_BEST_SELLER_DAYS;
}

/** Month and day as one comparable number, so a season can be checked by date. */
function monthDay(date: Date) {
  return (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

/**
 * Whether a seasonal piece is in its season *this* year.
 *
 * Only the month and day of the stored dates are read, so a season set once
 * repeats every year instead of quietly expiring — a wreath dated "15 November
 * to 31 December" would otherwise stop being seasonal for good on New Year's Day
 * and nobody would notice until next winter.
 *
 * A window that runs past New Year (15 November → 10 February) is handled by
 * comparing the two ends rather than assuming start comes first. One end on its
 * own is open-ended in the other direction.
 */
export function isInSeason(product: MerchandisableProduct, now = new Date()): boolean {
  const start = asDate(product.seasonStartsAt);
  const end = asDate(product.seasonEndsAt);
  if (!start && !end) return false;

  const today = monthDay(now);
  const from = start ? monthDay(start) : null;
  const to = end ? monthDay(end) : null;

  if (from != null && to != null) {
    return from <= to ? today >= from && today <= to : today >= from || today <= to;
  }
  if (from != null) return today >= from;
  return today <= (to as number);
}

/** A product that carries a season at all, in or out of it. */
export function hasSeason(product: MerchandisableProduct): boolean {
  return Boolean(asDate(product.seasonStartsAt) || asDate(product.seasonEndsAt));
}

export type BadgeTone = 'sale' | 'best-seller' | 'staff-pick' | 'new' | 'seasonal' | 'custom';
export type MerchBadge = { label: string; tone: BadgeTone };

export type BadgeFlags = {
  savingPercent?: number;
  isBestSeller?: boolean;
  isNew?: boolean;
  isInSeason?: boolean;
};

/**
 * The chips a card or product page shows, most useful first and capped so a
 * product that happens to qualify for everything does not turn into a wall of
 * pills. Tammy's own badge text outranks the automatic ones — if she wrote
 * something on a product, that is the thing she wants read.
 */
export function merchandisingBadges(
  product: MerchandisableProduct,
  flags: BadgeFlags = {},
  limit = 2
): MerchBadge[] {
  const badges: MerchBadge[] = [];
  /**
   * The saving is never suppressed. It is a fact about the price rather than a
   * label about the product, and a shopper scanning a grid for a discount is
   * entitled to see it whatever else the product is carrying.
   */
  if (flags.savingPercent && flags.savingPercent > 0)
    badges.push({ label: `Save ${flags.savingPercent}%`, tone: 'sale' });

  /**
   * Tammy's own words replace the automatic labels rather than sitting beside
   * them. The dashboard tells her exactly that — "a product with a badge shows
   * that instead of Best seller" — and appending both broke the promise while
   * making it impossible to override an earned badge with better copy, which is
   * the only reason to type one.
   */
  const custom = product.badge?.trim();
  if (custom) {
    badges.push({ label: custom, tone: 'custom' });
    return badges.slice(0, Math.max(1, limit));
  }

  if (flags.isBestSeller) badges.push({ label: 'Best seller', tone: 'best-seller' });
  if (product.staffPick) badges.push({ label: 'Tammy’s pick', tone: 'staff-pick' });
  if (flags.isNew) badges.push({ label: 'New', tone: 'new' });
  if (flags.isInSeason) badges.push({ label: 'In season', tone: 'seasonal' });

  return badges.slice(0, Math.max(1, limit));
}

/**
 * Badge wording Tammy can pick from a dropdown instead of retyping. The field
 * still accepts anything she writes — this is a shortcut, not a vocabulary.
 */
export const BADGE_PRESETS = [
  'Our pick',
  'Limited',
  'Last one',
  'Just potted',
  'Local pickup only',
  'Gift ready',
  'Small batch',
  'Back in stock'
] as const;

export type HomepageSectionKind =
  | 'FEATURED'
  | 'NEW_ARRIVALS'
  | 'BEST_SELLERS'
  | 'RECENT_BEST_SELLERS'
  | 'STAFF_PICKS'
  | 'SEASONAL'
  | 'ON_SALE'
  | 'COLLECTION'
  | 'COLLECTION_TILES';

/**
 * What each homepage row is and what it needs, used by the dashboard dropdown
 * and by the homepage itself so the two cannot describe a row differently.
 */
export const HOMEPAGE_SECTION_KINDS: ReadonlyArray<{
  kind: HomepageSectionKind;
  label: string;
  description: string;
  /** True when the row is meaningless without a collection chosen. */
  needsCollection?: boolean;
}> = [
  {
    kind: 'FEATURED',
    label: 'Featured products',
    description: 'The products you ticked as featured.'
  },
  {
    kind: 'NEW_ARRIVALS',
    label: 'New arrivals',
    description: `Listed in the last ${NEW_ARRIVAL_DAYS} days, newest first.`
  },
  {
    kind: 'BEST_SELLERS',
    label: 'Best sellers',
    description: 'Worked out from paid orders, plus anything you pinned.'
  },
  {
    kind: 'RECENT_BEST_SELLERS',
    label: 'Selling right now',
    description: `Best sellers by the last ${RECENT_BEST_SELLER_DAYS} days rather than the season, most sold first.`
  },
  {
    kind: 'STAFF_PICKS',
    label: 'Tammy’s picks',
    description: 'The products you marked as your own pick.'
  },
  {
    kind: 'SEASONAL',
    label: 'In season now',
    description: 'Products inside their season dates today.'
  },
  { kind: 'ON_SALE', label: 'On sale', description: 'Anything with a compare-at price.' },
  {
    kind: 'COLLECTION',
    label: 'One collection’s products',
    description: 'Products from a collection you choose.',
    needsCollection: true
  },
  {
    kind: 'COLLECTION_TILES',
    label: 'Collection tiles',
    description: 'Picture links to your featured collections.'
  }
];

export function homepageSectionKindLabel(kind: string) {
  return HOMEPAGE_SECTION_KINDS.find((entry) => entry.kind === kind)?.label || kind;
}

export function homepageSectionNeedsCollection(kind: string) {
  return Boolean(HOMEPAGE_SECTION_KINDS.find((entry) => entry.kind === kind)?.needsCollection);
}

/**
 * The homepage before anyone has arranged it. Seeded once so an untouched shop
 * still leads with collections and featured stock the way it always did, and so
 * the merchandising page has something to reorder rather than an empty list.
 */
export const DEFAULT_HOMEPAGE_SECTIONS: ReadonlyArray<{
  kind: HomepageSectionKind;
  eyebrow: string;
  title: string;
  subtitle?: string;
  maxItems: number;
  sortOrder: number;
}> = [
  {
    kind: 'COLLECTION_TILES',
    eyebrow: 'Shop the garden',
    title: 'Bring a little Hillside home.',
    subtitle:
      'Houseplants, carnivorous plants, succulents, air plants, terrarium supplies and small-batch botanical goods, grouped the way we keep them on the bench.',
    maxItems: 6,
    sortOrder: 10
  },
  {
    kind: 'BEST_SELLERS',
    eyebrow: 'Loved by our customers',
    title: 'What is selling this season.',
    subtitle: 'The plants and goods going home with people most often right now.',
    maxItems: 4,
    sortOrder: 20
  },
  {
    kind: 'NEW_ARRIVALS',
    eyebrow: 'Just potted',
    title: 'New on the bench.',
    subtitle: 'The most recent arrivals, added as they are potted and photographed.',
    maxItems: 4,
    sortOrder: 30
  },
  {
    kind: 'FEATURED',
    eyebrow: 'New & noteworthy',
    title: 'Our current favorites.',
    maxItems: 4,
    sortOrder: 40
  }
];
