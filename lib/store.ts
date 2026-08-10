export const FALLBACK_PRODUCT_IMAGE =
  '/images/catalog/house-plants.webp';

export const CANONICAL_SITE_URL = 'https://thehillsidegardens.com';

/**
 * Photo ids that were seeded into the database historically and have since been
 * deleted upstream, mapped to the local image that replaces them. Existing rows
 * still hold these values — the deploy seed deliberately preserves owner data
 * rather than overwriting it — so they are resolved at read time.
 */
const LEGACY_IMAGE_REPLACEMENTS: Array<[string, string]> = [
  ['photo-1614594575810-51b862c2d7b6', '/images/catalog/house-plants.webp'],
  ['photo-1593691509543-c55fb32e5cee', '/images/catalog/house-plants.webp'],
  ['photo-1593482892290-f54927ae2bb0', '/images/catalog/live-plant-planters.webp'],
  ['photo-1509423350716-97f2360af8e4', '/images/scenes/potting-bench.webp'],
  ['photo-1485955900006-10f4d324d411', '/images/catalog/house-plants.webp'],
  ['photo-1497250681960-ef046c08a56e', '/images/catalog/live-plant-planters.webp'],
  ['photo-1416879595882-3373a0480b5b', '/images/scenes/potting-bench.webp'],
  ['photo-1466692476868-aef1dfb1e735', '/images/scenes/hillside-hero.webp']
];

/**
 * Resolves a stored image value to something safe to render or advertise.
 * Rendering already went through this via ResilientImage, but metadata and
 * JSON-LD did not, so shared links and rich results were still advertising
 * deleted photos.
 */
export function resolveImageUrl(source?: string | null) {
  const trimmed = source?.trim();
  if (!trimmed) return FALLBACK_PRODUCT_IMAGE;

  const replacement = LEGACY_IMAGE_REPLACEMENTS.find(([legacyId]) => trimmed.includes(legacyId));
  return replacement?.[1] || trimmed;
}

export function normalizeHillsideDomain(value: string) {
  return value.replaceAll('thehillsidegarden.com', 'thehillsidegardens.com');
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(cents / 100);
}

/**
 * Navigation categories are merchandising groups, not database enums. A shopper
 * looking for "Botanicals" expects soaps, lotions and anything else handmade —
 * mapping each nav link to a single ProductType hid part of the catalog from the
 * only navigation that pointed at it.
 */
export const CATEGORY_GROUPS: Record<string, { label: string; types: string[] }> = {
  PLANT: { label: 'Plants', types: ['PLANT'] },
  TEA: { label: 'Teas & Herbals', types: ['TEA', 'TEA_SUPPLY'] },
  BOTANICAL: { label: 'Botanicals', types: ['SOAP', 'LOTION', 'OTHER'] }
};

/** Accepts a group key, a bare ProductType, or a comma separated list of either. */
export function categoryTypes(value?: string | null): string[] {
  const raw = (value || '').trim().toUpperCase();
  if (!raw || raw === 'ALL') return [];
  return raw
    .split(',')
    .flatMap((entry) => {
      const key = entry.trim();
      if (!key) return [];
      return CATEGORY_GROUPS[key]?.types || [key];
    });
}

export function categoryLabel(value?: string | null) {
  const key = (value || '').trim().toUpperCase();
  if (CATEGORY_GROUPS[key]) return CATEGORY_GROUPS[key].label;
  return key ? productTypeLabel(key) : 'Everything';
}

export function discountPercent(priceCents: number, compareAtCents?: number | null) {
  if (!compareAtCents || compareAtCents <= priceCents) return 0;
  return Math.round(((compareAtCents - priceCents) / compareAtCents) * 100);
}

export function freeShippingThresholdCents() {
  return Math.max(0, Number(process.env.FREE_SHIPPING_THRESHOLD_CENTS || 7500));
}

export function productTypeLabel(type: string) {
  const labels: Record<string, string> = {
    PLANT: 'Plant',
    TEA: 'Tea',
    TEA_SUPPLY: 'Tea supply',
    LOTION: 'Lotion',
    SOAP: 'Soap',
    OTHER: 'Botanical good'
  };
  return labels[type] || type.replaceAll('_', ' ').toLowerCase();
}

export function clampQuantity(value: number, inventory: number) {
  return Math.max(1, Math.min(Math.max(1, inventory), Math.floor(value || 1)));
}

/**
 * The origin every absolute link the site advertises is built from: canonical
 * tags, og:url, og:image, the sitemap, robots.txt, and the private classroom
 * link emailed to online-class customers.
 *
 * This used to fall back to http://localhost:3000, and the deployed site was
 * using that fallback — the sitemap listed localhost URLs, robots.txt pointed
 * search engines at a localhost sitemap, and class confirmation emails sent
 * customers a localhost link. Setting the variable in Railway's runtime
 * environment would not have fixed it either: Next inlines NEXT_PUBLIC_* at
 * build time, so a value that is absent when `next build` runs is compiled
 * away as undefined no matter what the container is given later.
 *
 * So the fallback is the real public domain, which is correct for any deployed
 * build. localhost is only ever right when a dev server is the thing serving.
 */
export function siteBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return normalizeHillsideDomain(configured);
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : CANONICAL_SITE_URL;
}

export function absoluteUrl(path = '/') {
  return new URL(path, siteBaseUrl()).toString();
}
