/**
 * Turning a pasted Amazon link into a finished pick.
 *
 * Publishing an influencer pick used to mean typing a title, a category, a
 * photo URL and a blurb by hand, which is four chances to mistype and one more
 * reason not to bother. Everything here exists so the owner can paste the link
 * and stop: the ASIN, a clean affiliate URL, and — when Amazon answers — the
 * real title, photograph, blurb and department all come out of the link itself.
 *
 * Deliberately free of Next, Prisma and `fetch` so `npm test` can cover the
 * parsing against saved page fixtures. The network half lives in
 * `lib/amazon-lookup.ts`.
 */

export type AmazonProductDetails = {
  title: string;
  description: string;
  imageUrl: string;
  category: string;
};

/** What we could not fill in ourselves is simply left empty, never guessed. */
export const EMPTY_DETAILS: AmazonProductDetails = {
  title: '',
  description: '',
  imageUrl: '',
  category: ''
};

/** The name a pick falls back to when a link carries nothing readable at all. */
export const DEFAULT_PICK_TITLE = 'Amazon pick';

const AMAZON_HOST = /(^|\.)amazon\.[a-z]{2,3}(\.[a-z]{2})?$/i;

/**
 * Share sheets and the Amazon app hand out shortened links. They carry no ASIN,
 * so they have to be followed before anything can be read out of them.
 */
const SHORT_HOSTS = new Set(['amzn.to', 'a.co', 'amzn.eu', 'amzn.asia', 'amzn.com']);

/** Path segments that are Amazon's own routing rather than the product name. */
const ROUTING_SEGMENTS = new Set([
  'dp',
  'gp',
  'product',
  'aw',
  'd',
  'b',
  'e',
  's',
  'hz',
  'exec',
  'obidos',
  'ref',
  'sspa',
  'shop',
  'stores',
  'offer-listing',
  'product-reviews',
  'slredirect',
  'sim',
  'ask'
]);

/**
 * Session and placement noise Amazon appends to a copied link. None of it
 * survives into the affiliate URL the customer clicks.
 */
const TRACKING_PARAMS = [
  'ref',
  'ref_',
  'psc',
  'th',
  'qid',
  'sr',
  'keywords',
  'sprefix',
  'crid',
  'content-id',
  'dib',
  'dib_tag',
  'pd_rd_i',
  'pd_rd_r',
  'pd_rd_w',
  'pd_rd_wg',
  'pf_rd_i',
  'pf_rd_m',
  'pf_rd_p',
  'pf_rd_r',
  'pf_rd_s',
  'pf_rd_t',
  '_encoding',
  'smid',
  'spLa',
  'social_share',
  'starsLeft',
  'skipTwisterOG'
];

/**
 * `/dp/B01N5IB20Q`, `/gp/product/…`, the mobile `/gp/aw/d/…` and the ancient
 * `/exec/obidos/ASIN/…` all name the same thing in a different place.
 */
const ASIN_PATH_PATTERNS = [
  /\/dp\/(?:product\/)?([A-Z0-9]{10})(?:[/?]|$)/i,
  /\/gp\/(?:product|aw\/d|offer-listing)\/([A-Z0-9]{10})(?:[/?]|$)/i,
  /\/exec\/obidos\/(?:asin|tg\/detail\/-)\/([A-Z0-9]{10})(?:[/?]|$)/i,
  /\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
  /\/product-reviews\/([A-Z0-9]{10})(?:[/?]|$)/i
];

/**
 * A bare segment is only read as an ASIN when it is unmistakably one: modern
 * ASINs start `B0`, and books use their ISBN-10. Without that, a ten-letter
 * word out of the product slug would be mistaken for the identifier.
 */
const BARE_ASIN = /^(B0[A-Z0-9]{8}|\d{9}[\dX])$/;

export function normalizeAmazonUrl(raw?: string | URL | null): URL | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  // Pasting from the address bar sometimes drops the scheme; a bare
  // `amazon.com/dp/…` is still a link the owner meant to give us.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

export function isAmazonHost(host: string) {
  const bare = host.toLowerCase().replace(/^www\./, '');
  return SHORT_HOSTS.has(bare) || AMAZON_HOST.test(bare);
}

export function isAmazonLink(raw?: string | URL | null) {
  const url = normalizeAmazonUrl(raw);
  return Boolean(url && isAmazonHost(url.hostname));
}

/** A shortened link has to be followed before it can be read. */
export function isShortAmazonLink(raw?: string | URL | null) {
  const url = normalizeAmazonUrl(raw);
  if (!url) return false;
  return SHORT_HOSTS.has(url.hostname.toLowerCase().replace(/^www\./, ''));
}

export function extractAsin(raw?: string | URL | null): string | null {
  const url = normalizeAmazonUrl(raw);
  if (!url) return null;

  const path = url.pathname;
  for (const pattern of ASIN_PATH_PATTERNS) {
    const match = path.match(pattern);
    if (match) return match[1].toUpperCase();
  }

  const queryAsin = url.searchParams.get('asin') || url.searchParams.get('ASIN');
  if (queryAsin && BARE_ASIN.test(queryAsin.toUpperCase())) return queryAsin.toUpperCase();

  for (const segment of path.split('/')) {
    const candidate = segment.toUpperCase();
    if (BARE_ASIN.test(candidate)) return candidate;
  }
  return null;
}

/**
 * `smile.` shut down and the mobile host renders the same page; both are
 * normalized so two links to one product do not read as two products.
 */
function storefrontHost(host: string) {
  const lower = host.toLowerCase();
  const bare = lower.replace(/^(www|smile|m)\./, '');
  return AMAZON_HOST.test(bare) ? `www.${bare}` : lower;
}

/**
 * The link a customer clicks: the product, the associate tag, nothing else.
 *
 * The tag already on the pasted link wins — an influencer pulling links out of
 * their own Amazon storefront is carrying the tracking id that pays them, and
 * silently replacing it with the site default would send their commission
 * somewhere else.
 */
export function canonicalAmazonUrl(raw: string, associateTag = ''): string {
  const url = normalizeAmazonUrl(raw);
  if (!url) return String(raw || '').trim();

  const tag = (url.searchParams.get('tag') || associateTag || '').trim();
  const asin = extractAsin(url);

  if (asin && !SHORT_HOSTS.has(url.hostname.toLowerCase())) {
    const clean = new URL(`https://${storefrontHost(url.hostname)}/dp/${asin}`);
    if (tag) clean.searchParams.set('tag', tag);
    return clean.toString();
  }

  // A storefront page or a short link has no ASIN to build from, so the link is
  // kept as pasted — only the noise comes off.
  for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
  if (tag) url.searchParams.set('tag', tag);
  return url.toString();
}

/** Two links are the same pick when they point at the same item. */
export function amazonPickKey(raw: string) {
  return extractAsin(raw) || canonicalAmazonUrl(raw).toLowerCase();
}

const TITLE_CASE_EXCEPTIONS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with'
]);

function titleCase(value: string) {
  return value
    .split(' ')
    .map((word, index) =>
      index > 0 && TITLE_CASE_EXCEPTIONS.has(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(' ');
}

/** Cut at a word boundary; a title chopped mid-word reads like a bug. */
export function truncateWords(value: string, limit: number) {
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.\-–—]+$/, '')}…`;
}

/**
 * Amazon spells the product name into the link itself
 * (`/Fiskars-Bypass-Pruning-Shears/dp/B0000AX2VU`). It is not as good as the
 * page title, but it is a real name, it is always there, and it means a pick
 * still publishes with something readable when Amazon will not answer us.
 */
export function titleFromAmazonUrl(raw?: string | URL | null): string {
  const url = normalizeAmazonUrl(raw);
  if (!url) return '';

  // A short link's path is a share code (`/d/9xKq2mB`), not a name.
  if (isShortAmazonLink(url)) return '';

  const asin = extractAsin(url);
  const candidates = url.pathname
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .filter((segment) => {
      const lower = segment.toLowerCase();
      if (!segment || ROUTING_SEGMENTS.has(lower)) return false;
      if (asin && segment.toUpperCase() === asin) return false;
      if (BARE_ASIN.test(segment.toUpperCase())) return false;
      // `ref=sr_1_3` and friends survive as a path segment on some links.
      if (/^(ref|node|qid|sr)[=_]/i.test(segment)) return false;
      return /[a-z]/i.test(segment);
    });

  const slug = candidates.sort((a, b) => b.length - a.length)[0];
  if (!slug) return '';

  const words = slug
    .replace(/[-_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (words.length < 3) return '';

  const spelled = /[A-Z]/.test(words) ? words : titleCase(words);
  return truncateWords(spelled, 90);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  trade: '™',
  reg: '®',
  deg: '°',
  eacute: 'é'
};

export function decodeEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

export function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reads a meta tag written in either attribute order. */
export function metaContent(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1]).trim();
  }
  return '';
}

/**
 * Amazon serves the same photograph at a dozen sizes by writing the crop into
 * the filename (`…._AC_SX679_.jpg`). Dropping that leaves the full-size
 * original, which is what the picks grid wants.
 */
export function fullSizeAmazonImage(url: string) {
  return url.trim().replace(/\._[A-Z0-9,_]+_\.(jpg|jpeg|png|gif|webp)$/i, '.$1');
}

/**
 * `data-a-dynamic-image` is a JSON map of every rendition to its pixel size.
 * The largest is the one worth keeping.
 */
function largestDynamicImage(html: string): string {
  const match = html.match(/data-a-dynamic-image=["']({[^"']+})["']/i);
  if (!match) return '';
  try {
    const parsed = JSON.parse(decodeEntities(match[1])) as Record<string, number[]>;
    const best = Object.entries(parsed).sort(
      ([, a], [, b]) => (b?.[0] || 0) * (b?.[1] || 0) - (a?.[0] || 0) * (a?.[1] || 0)
    )[0];
    return best?.[0] || '';
  } catch {
    return '';
  }
}

function attribute(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return match ? decodeEntities(match[1]).trim() : '';
}

export function imageFromAmazonHtml(html: string): string {
  const candidates = [
    attribute(html, /id=["']landingImage["'][^>]*\sdata-old-hires=["']([^"']+)["']/i),
    largestDynamicImage(html),
    metaContent(html, 'og:image'),
    attribute(html, /id=["']landingImage["'][^>]*\ssrc=["']([^"']+)["']/i),
    attribute(html, /id=["']imgBlkFront["'][^>]*\ssrc=["']([^"']+)["']/i),
    attribute(html, /id=["']ebooksImgBlkFront["'][^>]*\ssrc=["']([^"']+)["']/i)
  ];

  const found = candidates
    .map((candidate) => candidate.trim())
    .find((candidate) => /^https?:\/\//i.test(candidate) && !candidate.startsWith('data:'));
  return found ? fullSizeAmazonImage(found) : '';
}

/**
 * `<title>` reads `Amazon.com: Fiskars Bypass Pruners : Patio, Lawn & Garden`.
 * The store name and the department are Amazon's, not the product's — and the
 * separator is ` : ` with spaces, which a product name almost never uses.
 */
export function cleanAmazonTitle(raw: string): string {
  let title = decodeEntities(raw).replace(/\s+/g, ' ').trim();
  title = title.replace(/^Amazon(\.[a-z.]+)?\s*[:\-–]\s*/i, '');
  title = title.replace(/\s*[:\-–]\s*Amazon(\.[a-z.]+)?\s*$/i, '');
  const separator = title.lastIndexOf(' : ');
  if (separator >= 10) title = title.slice(0, separator);
  return truncateWords(title.trim(), 110);
}

export function titleFromAmazonHtml(html: string): string {
  const productTitle = attribute(
    html,
    /id=["']productTitle["'][^>]*>([\s\S]{1,400}?)<\/(?:span|h1)>/i
  );
  const candidates = [
    productTitle ? stripTags(productTitle) : '',
    metaContent(html, 'og:title'),
    metaContent(html, 'title'),
    stripTags(attribute(html, /<title[^>]*>([\s\S]{1,400}?)<\/title>/i))
  ];
  const found = candidates.map(cleanAmazonTitle).find((candidate) => candidate.length > 2);
  return found || '';
}

const BULLET_BOILERPLATE =
  /^(make sure this fits|see more product details|report an issue|› see more)/i;

/**
 * The feature bullets say what the thing actually is, which is what a shopper
 * wants under the photograph. Amazon's own og:description is the fallback.
 */
export function descriptionFromAmazonHtml(html: string): string {
  const block = html.match(
    /id=["']feature-bullets["'][\s\S]{0,6000}?(?=<\/div>\s*<(?:div|section|hr|script)|$)/i
  );
  if (block) {
    const bullets = [
      ...block[0].matchAll(
        /<span[^>]*class=["'][^"']*a-list-item[^"']*["'][^>]*>([\s\S]{0,400}?)<\/span>/gi
      )
    ]
      .map((match) => stripTags(match[1]))
      .filter((line) => line.length > 12 && !BULLET_BOILERPLATE.test(line));

    if (bullets.length) {
      const sentences = bullets
        .slice(0, 2)
        .map((line) => (/[.!?]$/.test(line) ? line : `${line}.`));
      return truncateWords(sentences.join(' '), 260);
    }
  }

  const fallback = metaContent(html, 'og:description') || metaContent(html, 'description');
  return fallback ? truncateWords(stripTags(fallback), 260) : '';
}

/**
 * The breadcrumb's last crumb is the narrow department — "Pruning Shears"
 * rather than "Patio, Lawn & Garden" — which is what the card's pill wants.
 */
export function categoryFromAmazonHtml(html: string): string {
  const block = html.match(
    /id=["']wayfinding-breadcrumbs_feature_div["']([\s\S]{0,4000}?)<\/div>\s*<\/div>/i
  );
  const source = block?.[1] || '';
  const crumbs = [
    ...source.matchAll(
      /<a[^>]*class=["'][^"']*a-link-normal[^"']*["'][^>]*>([\s\S]{0,120}?)<\/a>/gi
    )
  ]
    .map((match) => stripTags(match[1]))
    .filter(Boolean);
  const crumb = crumbs[crumbs.length - 1] || '';
  return crumb ? truncateWords(crumb, 40) : '';
}

/**
 * Amazon answers a server it does not recognise with a captcha page rather than
 * an error status. Publishing "Amazon.com" with a picture of a dog would look
 * like the feature worked, so the interstitial is detected and treated as a
 * lookup that simply did not happen.
 */
export function looksLikeRobotCheck(html: string) {
  const head = html.slice(0, 6000).toLowerCase();
  return (
    head.includes('captcha') ||
    head.includes('robot check') ||
    head.includes('/errors/validatecaptcha') ||
    head.includes('to discuss automated access to amazon data') ||
    head.includes('type the characters you see in this image') ||
    head.includes('sorry, we just need to make sure you')
  );
}

export function parseAmazonProductHtml(html: string): AmazonProductDetails {
  if (!html || looksLikeRobotCheck(html)) return { ...EMPTY_DETAILS };
  return {
    title: titleFromAmazonHtml(html),
    description: descriptionFromAmazonHtml(html),
    imageUrl: imageFromAmazonHtml(html),
    category: categoryFromAmazonHtml(html)
  };
}

export type AmazonPickDraft = {
  title: string;
  description: string | null;
  imageUrl: string | null;
  amazonUrl: string;
  category: string | null;
};

/**
 * The row that gets saved. Anything the lookup could not find is left null so
 * the public page falls back to its own artwork and wording, and so the owner
 * can see at a glance what is worth filling in by hand.
 */
export function amazonPickDraft(
  pastedUrl: string,
  details: Partial<AmazonProductDetails> = {},
  associateTag = ''
): AmazonPickDraft {
  const amazonUrl = canonicalAmazonUrl(pastedUrl, associateTag);
  const title = details.title?.trim() || titleFromAmazonUrl(pastedUrl) || DEFAULT_PICK_TITLE;
  return {
    title,
    description: details.description?.trim() || null,
    imageUrl: details.imageUrl?.trim() || null,
    amazonUrl,
    category: details.category?.trim() || null
  };
}
