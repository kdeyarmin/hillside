export const FALLBACK_PRODUCT_IMAGE = '/images/catalog/house-plants.webp';

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
 * Money for headlines rather than for totals: a round figure drops its cents, so
 * an announcement bar reads "orders $75+" instead of "orders $75.00+". Anything
 * that is not a whole dollar keeps both decimals.
 */
export function formatMoneyCompact(cents: number) {
  const fractionDigits = cents % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
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
  return raw.split(',').flatMap((entry) => {
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
  return Math.max(
    0,
    Number(
      process.env.FREE_SHIPPING_THRESHOLD_CENTS ||
        process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS ||
        7500
    )
  );
}

/** The standard shipping rate, read from the same value Stripe Checkout charges. */
export function flatShippingCents() {
  return Math.max(0, Number(process.env.FLAT_SHIPPING_CENTS || 895));
}

/**
 * How long a product's advertised price should be treated as good for. Google
 * warns about an Offer without it and may stop showing the price outright. A year
 * out is the usual convention for a shop that does not run time-boxed pricing.
 */
export function priceValidUntil(from = new Date()) {
  const until = new Date(from);
  until.setFullYear(until.getFullYear() + 1);
  return until.toISOString().slice(0, 10);
}

/**
 * The same threshold, readable from a client component. Only `NEXT_PUBLIC_*` is
 * inlined into the browser bundle, so the announcement bar and the cart drawer's
 * progress meter have to read this one. It is the value the shop *promises*;
 * `freeShippingThresholdCents` is the one Stripe Checkout actually charges by.
 */
export function publicFreeShippingThresholdCents() {
  return Math.max(
    0,
    Number(
      process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS ||
        process.env.FREE_SHIPPING_THRESHOLD_CENTS ||
        7500
    )
  );
}

/**
 * Picks one of `options` from a stable key. Used to spread placeholder artwork
 * so a shop row or a class list does not show the same photograph three times.
 *
 * Deterministic on purpose — a product that changed picture between renders
 * would be worse than one that repeats. FNV-1a with a final avalanche step,
 * because the obvious `hash * 31` variant leaves the low bits correlated and
 * sent half of a realistic set of plant slugs to the same image.
 */
export function pickForKey<T>(options: readonly T[], key: string): T {
  // An empty list is a mistake at the call site, not a case to paper over: the
  // signature promises a T, and quietly handing back `undefined` would surface
  // much later as a missing image with nothing pointing at the cause.
  if (!options.length) throw new Error('pickForKey needs at least one option to choose from.');
  if (options.length === 1) return options[0];

  let hash = 0x811c9dc5;
  for (let position = 0; position < key.length; position += 1) {
    hash ^= key.charCodeAt(position);
    hash = Math.imul(hash, 0x01000193);
  }

  // MurmurHash3 fmix32: without it the low bits barely move between keys.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;

  return options[(hash >>> 0) % options.length];
}

export const DEFAULT_BUSINESS_EMAIL = 'hello@thehillsidegardens.com';

/**
 * A single, valid-looking address, or null. Deliberately strict about what it
 * accepts: it backs both the compose box and the owner-alert recipients, and a
 * value SendGrid rejects fails the *whole* request it appears in.
 *
 * Commas and semicolons are rejected rather than split here, so a variable
 * holding `a@b.com,c@d.com` reads as the one malformed address it is instead of
 * quietly widening who gets the shop's mail.
 */
export function validEmailAddress(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return null;
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * The address customers are told to write to. Every page used to hardcode it,
 * so changing inboxes meant hunting through the footer, the contact page, the
 * privacy policy and a mailto in the classes empty state.
 */
export function businessEmail() {
  return normalizeHillsideDomain(process.env.BUSINESS_EMAIL?.trim() || DEFAULT_BUSINESS_EMAIL);
}

/**
 * Where owner alerts go: the shop inbox, plus Tammy's own address when
 * `OWNER_PERSONAL_EMAIL` is set. Everything the shop tells her about — a paid
 * order, an oversell, a website message, a class registration, an overbooked
 * class, a review waiting on her — should reach her wherever she is, while the
 * business inbox keeps the copy the shop's records are read from. Customer mail
 * does not come through here.
 *
 * The personal address is only ever a *recipient*. Mail still goes out as
 * `EMAIL_FROM` on the authenticated hillside domain, because sending as a
 * consumer mailbox SendGrid is not authorised for would fail SPF and DKIM
 * alignment and land in spam.
 *
 * Deduplicated case-insensitively so setting both variables to the same inbox
 * does not send her two of every notice.
 */
export function ownerNotificationEmails() {
  const personal = process.env.OWNER_PERSONAL_EMAIL?.trim();
  const addresses = [businessEmail(), ...(personal ? [normalizeHillsideDomain(personal)] : [])];
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const address of addresses) {
    /**
     * Validated properly, not just checked for an `@`. A variable holding
     * `tammy@comcast.net,attacker@example.com` reaches SendGrid as one
     * malformed recipient and fails the whole request — which would lose the
     * business inbox's copy too, the exact outcome this guard exists to
     * prevent.
     */
    const clean = validEmailAddress(address);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(clean);
  }
  return valid;
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

/**
 * The return terms to advertise in a product's structured data, by product type.
 *
 * This has to be derived rather than stated once, because the published policy is
 * not uniform: live plants, teas, opened personal-care products, custom
 * arrangements and clearance items are final sale, while unopened nonperishable
 * merchandise may be returned within 14 days. A single blanket 14-day policy in
 * the markup would have search results promising a return right on a monstera
 * that the shipping-and-returns page explicitly refuses — worse than saying
 * nothing, because a shopper can act on it.
 *
 * Soaps and lotions are returnable here because the policy only makes them final
 * sale once *opened*, which is the same condition it puts on all merchandise.
 */

/** Matches the published shipping-returns page. Search must not advertise faster. */
export const HANDLING_MIN_DAYS = 2;
export const HANDLING_MAX_DAYS = 4;

export function returnPolicyForType(type: string) {
  const finalSale = type === 'PLANT' || type === 'TEA';

  if (finalSale) {
    return {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'US',
      returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted'
    };
  }

  return {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: 'US',
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: 14,
    returnMethod: 'https://schema.org/ReturnByMail',
    // Return postage is the customer's, per the published policy.
    returnFees: 'https://schema.org/ReturnShippingFees'
  };
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
  if (configured && !isUnusableAsPublicOrigin(configured))
    return normalizeHillsideDomain(configured);

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

/**
 * The origin Stripe sends the customer back to after Checkout.
 *
 * This exists as its own function because both checkout routes used to build it
 * from `process.env.NEXT_PUBLIC_SITE_URL` directly, bypassing `siteBaseUrl()` and
 * its loopback guard. The deployed service has that variable set to a loopback
 * address — which is the whole reason `siteBaseUrl` was written — so paying
 * customers were redirected to `http://localhost:3000/order/success`. The payment
 * succeeded; the customer saw a connection error.
 *
 * `absoluteUrl` is not usable here: Stripe's `{CHECKOUT_SESSION_ID}` placeholder
 * has to survive into the URL literally, and `new URL()` percent-encodes the
 * braces. So this returns a bare origin for callers to concatenate, with any
 * trailing slash removed so `${origin}/order/success` cannot double up.
 */
export function checkoutReturnOrigin() {
  return siteBaseUrl().replace(/\/+$/, '');
}

/**
 * `Order.invoiceNumber` is `@unique`, and this used to be the last 8 digits of
 * `Date.now()` — millisecond-aligned, so two orders placed in the same
 * millisecond collide. A collision makes the webhook's `order.create` throw, and
 * a throw there means Stripe retries, gives up, and the paid order is never
 * recorded anywhere. The random suffix makes that effectively impossible while
 * keeping the number short enough to read over the phone.
 */
export function newInvoiceNumber() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  // Five base36 characters — about 60 million values per millisecond. Three was
  // enough for any realistic order rate, but the number is written on packing
  // slips and read over the phone, so two extra characters is a cheap way to make
  // a collision genuinely impossible rather than merely unlikely.
  const suffix = Array.from({ length: 5 }, () =>
    Math.floor(Math.random() * 36)
      .toString(36)
      .toUpperCase()
  ).join('');
  return `HG-${stamp}${suffix}`;
}
