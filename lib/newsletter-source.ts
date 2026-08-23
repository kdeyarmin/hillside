/**
 * Where a newsletter signup came from.
 *
 * The subscriber table has always had a `source` column and every signup wrote
 * the same word into it — "website" — so the dashboard could show a column that
 * told Tammy nothing. These are the placements, as a fixed list rather than
 * free text, because the value is posted by the browser: an allowlist keeps the
 * column a small set that can be counted and stops a caller writing whatever it
 * likes into a field the owner reads.
 *
 * Pure on purpose — `npm test` covers the parsing and the rollup.
 */

export const DEFAULT_NEWSLETTER_SOURCE = 'website';

export type NewsletterSourceKey =
  | 'homepage'
  | 'footer'
  | 'product'
  | 'cart'
  | 'care-guide'
  | 'back-in-stock'
  | 'checkout'
  | 'gifts'
  | 'website';

export const NEWSLETTER_SOURCES: ReadonlyArray<{
  key: NewsletterSourceKey;
  label: string;
  /** What the owner should read into it, on the dashboard. */
  hint: string;
}> = [
  { key: 'homepage', label: 'Homepage', hint: 'The signup panel at the foot of the front page.' },
  { key: 'footer', label: 'Site footer', hint: 'The compact form in the footer of every page.' },
  { key: 'product', label: 'Product page', hint: 'Someone reading about one particular item.' },
  { key: 'cart', label: 'Cart', hint: 'Signed up while a basket was open.' },
  { key: 'care-guide', label: 'Care guide', hint: 'Came in through the plant care library.' },
  {
    key: 'back-in-stock',
    label: 'Back-in-stock',
    hint: 'Ticked the extra box while joining a restock list.'
  },
  { key: 'checkout', label: 'After checkout', hint: 'Joined from the order confirmation page.' },
  { key: 'gifts', label: 'Gift guide', hint: 'Came in from the gift pages.' },
  { key: 'website', label: 'Somewhere else', hint: 'Older signups, before sources were recorded.' }
];

const SOURCE_KEYS = new Set<string>(NEWSLETTER_SOURCES.map((entry) => entry.key));

/** A posted source, or the catch-all. Never throws, never stores junk. */
export function readNewsletterSource(value: unknown): NewsletterSourceKey {
  const key = String(value ?? '')
    .trim()
    .toLowerCase();
  return SOURCE_KEYS.has(key) ? (key as NewsletterSourceKey) : DEFAULT_NEWSLETTER_SOURCE;
}

export function newsletterSourceLabel(value: string | null | undefined) {
  const key = readNewsletterSource(value);
  // An unrecognised stored value is shown as itself rather than relabelled, so
  // a row written by an older build is not quietly reported as something else.
  const raw = String(value ?? '').trim();
  if (raw && !SOURCE_KEYS.has(raw.toLowerCase())) return raw;
  return NEWSLETTER_SOURCES.find((entry) => entry.key === key)?.label || 'Somewhere else';
}

export const SOURCE_DETAIL_MAX = 120;

/**
 * The page a signup happened on, kept only when it is a plain site path.
 *
 * The footer form is on every page, so the source alone would say "footer" and
 * stop there; the path is what turns that into "the care guide for monstera is
 * bringing people in". It is posted by the browser, so anything that is not an
 * obviously safe relative path — an absolute URL, a scheme, a fragment — is
 * dropped rather than stored and later rendered.
 */
export function readNewsletterSourceDetail(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const path = raw.split(/[?#]/)[0];
  if (!/^\/[A-Za-z0-9/_-]*$/.test(path)) return null;
  if (path.includes('//')) return null;
  return path.slice(0, SOURCE_DETAIL_MAX);
}

/**
 * One subscriber, or — when `count` is given — a pre-grouped tally of that
 * many. The dashboard groups in SQL rather than reading every row back, and
 * this is what lets the same rollup serve both shapes.
 */
export type SubscriberSourceRow = { source: string | null; active: boolean; count?: number };

export type NewsletterSourceCount = {
  key: string;
  label: string;
  total: number;
  active: number;
};

/**
 * Signups grouped by placement, busiest first, with the empty placements left
 * out. Answers the question the dashboard column could not: which forms are
 * actually earning their space.
 */
export function newsletterSourceBreakdown(rows: readonly SubscriberSourceRow[]) {
  const counts = new Map<string, NewsletterSourceCount>();
  for (const row of rows) {
    const raw = String(row.source ?? '').trim();
    const key = raw || DEFAULT_NEWSLETTER_SOURCE;
    const entry = counts.get(key) || {
      key,
      label: newsletterSourceLabel(key),
      total: 0,
      active: 0
    };
    const size = Math.max(0, row.count ?? 1);
    entry.total += size;
    if (row.active) entry.active += size;
    counts.set(key, entry);
  }
  return [...counts.values()].sort(
    (left, right) => right.total - left.total || left.label.localeCompare(right.label)
  );
}
