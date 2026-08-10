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

// IPv6 keeps its brackets here on purpose: URL.hostname serialises [::1] with
// them, so the bracketed form is the one a parsed URL is ever compared against.
const LOOPBACK_HOSTNAMES = new Set(['localhost', '0.0.0.0', '[::1]']);

/** All of 127.0.0.0/8 is loopback, not just 127.0.0.1. */
const IPV4_LOOPBACK = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/**
 * IPv4-mapped IPv6. URL normalises the embedded address to hex, so
 * [::ffff:127.0.0.1] arrives as [::ffff:7f00:1] and 127.x as [::ffff:7fxx:…].
 */
const IPV6_MAPPED_IPV4_LOOPBACK = /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/;

function isLoopbackHostname(hostname: string) {
  return (
    LOOPBACK_HOSTNAMES.has(hostname) ||
    // RFC 6761 reserves the whole .localhost TLD for loopback.
    hostname.endsWith('.localhost') ||
    IPV4_LOOPBACK.test(hostname) ||
    IPV6_MAPPED_IPV4_LOOPBACK.test(hostname)
  );
}

/**
 * True when a value cannot serve as the site's public origin — either it names
 * an address that only resolves on the machine serving it, or it does not parse
 * as a URL at all. Both are equally unusable, so they get one answer.
 */
function isUnusableAsPublicOrigin(value: string) {
  try {
    return isLoopbackHostname(new URL(value).hostname.toLowerCase());
  } catch {
    return true;
  }
}

let warnedAboutBase = false;

/**
 * The origin every absolute link the site advertises is built from: canonical
 * tags, og:url, og:image, the sitemap, robots.txt, and the private classroom
 * link emailed to online-class customers.
 *
 * All of these were coming out as http://localhost:3000 in production, because
 * NEXT_PUBLIC_SITE_URL is set to a loopback address on the deployed service.
 * The sitemap listed localhost URLs, robots.txt pointed search engines at a
 * localhost sitemap, and class confirmation emails sent paying customers a
 * localhost link.
 *
 * A production build cannot advertise a loopback address — by definition it
 * resolves to the visitor's own machine, not ours — so such a value is refused
 * rather than honoured, and the canonical domain is used instead. This keeps
 * the site correct whether the variable is unset, correct, or misconfigured.
 * Note that fixing the variable alone would not have been enough anyway: Next
 * inlines NEXT_PUBLIC_* at build time, so the value has to be right when
 * `next build` runs, not merely when the container starts.
 *
 * Under `next dev`, localhost is the truth, so anything goes.
 */
export function siteBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) return normalizeHillsideDomain(configured || 'http://localhost:3000');
  if (configured && !isUnusableAsPublicOrigin(configured)) return normalizeHillsideDomain(configured);

  if (configured && !warnedAboutBase) {
    warnedAboutBase = true;
    console.warn(
      `[hillside] Ignoring NEXT_PUBLIC_SITE_URL="${configured}": a deployed build cannot ` +
        `advertise a loopback or unparseable address. Using ${CANONICAL_SITE_URL} instead. ` +
        `Set NEXT_PUBLIC_SITE_URL to the public origin at build time to override.`
    );
  }
  return CANONICAL_SITE_URL;
}

export function absoluteUrl(path = '/') {
  return new URL(path, siteBaseUrl()).toString();
}
