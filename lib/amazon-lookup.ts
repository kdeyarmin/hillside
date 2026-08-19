/**
 * Reading an Amazon product page so the owner does not have to retype it.
 *
 * This is the one piece of the picks flow that depends on somebody else's
 * server answering, so it is written to fail quietly and specifically: every
 * outcome below still lets the pick publish, and each one says something
 * different to the owner about what, if anything, is worth filling in by hand.
 */

import {
  EMPTY_DETAILS,
  extractAsin,
  isAmazonLink,
  isShortAmazonLink,
  looksLikeRobotCheck,
  normalizeAmazonUrl,
  parseAmazonProductHtml,
  type AmazonProductDetails
} from './amazon-pick.ts';

export type AmazonLookupOutcome =
  /** Title and photograph both found. */
  | 'ok'
  /** The page answered but did not give up everything. */
  | 'partial'
  /** Amazon served a captcha or refused the request outright. */
  | 'blocked'
  /** Timed out, DNS failure, connection reset. */
  | 'unreachable'
  /** Not an Amazon link at all. */
  | 'invalid';

export type AmazonLookupResult = {
  outcome: AmazonLookupOutcome;
  /** The link after any short-link redirects; the ASIN is read out of this. */
  resolvedUrl: string;
  details: AmazonProductDetails;
};

type LookupOptions = {
  /** Injected by the tests; production uses the platform `fetch`. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
};

const DEFAULT_TIMEOUT_MS = 9_000;

/**
 * A product page is around a megabyte. The cap is what stops a redirect to
 * something enormous from being read into the dashboard's memory — the parser
 * only ever looks at the head of the document anyway.
 */
const DEFAULT_MAX_BYTES = 3_000_000;

/** Enough for Amazon's own country and canonical-path hops, and no more. */
const MAX_REDIRECTS = 5;

/**
 * Amazon answers with these when it wants a person rather than the product —
 * a sign-in wall, a consent page, an error. They carry a title and a logo, so
 * a parse would happily publish a pick called "Amazon Sign-In".
 */
const NON_PRODUCT_PATHS = [
  '/ap/signin',
  '/ap/register',
  '/ap/cvf',
  '/errors/',
  '/gp/help',
  '/gp/css/',
  '/gp/cart',
  '/gp/navigation',
  '/privacy',
  '/cookieprefs'
];

/**
 * Amazon serves a stripped page — no title block, no image map — to anything
 * that does not look like a browser. These headers are what a desktop Chrome
 * sends; without them the lookup "succeeds" and finds nothing.
 */
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Upgrade-Insecure-Requests': '1'
} as const;

/** The associate tag every published link carries when one is configured. */
export function associateTag() {
  return process.env.AMAZON_ASSOCIATE_TAG?.trim() || '';
}

/**
 * Reads at most `maxBytes` of the response, then stops pulling.
 *
 * Exported for the test that holds it to the chunk boundaries: what it does
 * with a character split across two of them is invisible from the outside.
 */
export async function readCapped(response: Response, maxBytes: number) {
  const body = response.body;
  if (!body) return await response.text();

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  let read = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (read >= maxBytes) break;
    }
  } finally {
    // Releasing the lock lets the connection be discarded rather than left
    // half-read when the cap trips.
    await reader.cancel().catch(() => {});
  }

  // A chunk boundary can land in the middle of a multi-byte character, and the
  // streaming decoder holds those bytes back until it is told the text has
  // ended. Without this the last character of the page — or of the truncated
  // read — silently disappears.
  return html + decoder.decode();
}

type PageFetch =
  | { response: Response; url: string }
  | { failure: Exclude<AmazonLookupOutcome, 'ok' | 'partial'>; url: string };

/**
 * Walks the redirect chain a hop at a time, checking where each one points
 * before going there.
 *
 * `redirect: 'follow'` would have this server request and read whatever the
 * chain ended at — and the chain is written by whoever controls the link.
 * A pasted `amzn.to` that redirects to `169.254.169.254` would have been
 * fetched, parsed, and its contents published onto the picks page. Every hop
 * is therefore checked against the Amazon hosts before it is followed, and a
 * chain that leaves them is treated as a lookup that did not happen.
 */
async function fetchFollowingAmazon(
  startUrl: string,
  fetchImpl: typeof fetch,
  method: 'GET' | 'HEAD',
  timeoutMs: number
): Promise<PageFetch> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetchImpl(current, {
        method,
        redirect: 'manual',
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      return { failure: 'unreachable', url: current };
    }

    if (response.status < 300 || response.status >= 400) return { response, url: current };

    const location = response.headers.get('location');
    let next = '';
    try {
      next = location ? new URL(location, current).toString() : '';
    } catch {
      next = '';
    }
    if (!next || !isAmazonLink(next)) return { failure: 'blocked', url: current };
    current = next;
  }

  // A chain this long is a loop or a fight with a cookie wall, not a product.
  return { failure: 'unreachable', url: current };
}

/**
 * Whether the page we were sent to is still the item that was asked for.
 *
 * Amazon answers a request it does not like by redirecting to a sign-in or
 * consent page rather than by failing, and those pages parse perfectly well.
 * The ASIN out of the pasted link is the check: land somewhere that is not
 * that product and the lookup counts as refused, so the pick is published from
 * the link instead of from Amazon's furniture.
 */
function isProductDestination(requestedUrl: string, resolvedUrl: string) {
  const path = normalizeAmazonUrl(resolvedUrl)?.pathname.toLowerCase() || '';
  if (NON_PRODUCT_PATHS.some((prefix) => path.startsWith(prefix))) return false;

  const requested = extractAsin(requestedUrl);
  if (!requested) return true;
  return extractAsin(resolvedUrl) === requested;
}

/**
 * Fetches the product page and reads what it can out of it.
 *
 * Never throws: a lookup that fails is an ordinary outcome here, because the
 * owner's pick still publishes from the link alone.
 */
export async function lookupAmazonProduct(
  rawUrl: string,
  options: LookupOptions = {}
): Promise<AmazonLookupResult> {
  const url = normalizeAmazonUrl(rawUrl);
  if (!url || !isAmazonLink(url)) {
    return {
      outcome: 'invalid',
      resolvedUrl: String(rawUrl || '').trim(),
      details: { ...EMPTY_DETAILS }
    };
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const pasted = url.toString();
  if (typeof fetchImpl !== 'function') {
    return { outcome: 'unreachable', resolvedUrl: pasted, details: { ...EMPTY_DETAILS } };
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /**
   * A short link is only worth anything once it has been followed, so the
   * address we ended up at is what the pick is built from. When even that
   * fails, a HEAD is one more chance at the real address — and failing that
   * the pasted link stands, because a dead `amzn.to` is still the owner's
   * link.
   *
   * Where we ended up is only kept if it is still the item that was asked for.
   * A link redirected to the sign-in wall reaches a perfectly good Amazon
   * address, and storing that one would leave the pick pointing at the wall,
   * named "Signin", and unmatchable against the same product pasted again.
   */
  const giveUp = async (outcome: AmazonLookupOutcome, reached: string) => {
    const worthKeeping =
      reached !== pasted && isAmazonLink(reached) && isProductDestination(pasted, reached);
    const resolvedUrl = worthKeeping ? reached : pasted;
    if (!isShortAmazonLink(resolvedUrl)) {
      return { outcome, resolvedUrl, details: { ...EMPTY_DETAILS } };
    }
    return {
      outcome,
      resolvedUrl: await resolveShortAmazonLink(resolvedUrl, options),
      details: { ...EMPTY_DETAILS }
    };
  };

  const fetched = await fetchFollowingAmazon(pasted, fetchImpl, 'GET', timeoutMs);
  if ('failure' in fetched) return await giveUp(fetched.failure, fetched.url);

  const { response, url: resolvedUrl } = fetched;

  if (!response.ok) {
    // 503 with a captcha body is Amazon's usual way of refusing a server.
    const refused = response.status === 403 || response.status === 503 || response.status === 429;
    return await giveUp(refused ? 'blocked' : 'unreachable', resolvedUrl);
  }

  if (!isProductDestination(pasted, resolvedUrl)) {
    return await giveUp('blocked', resolvedUrl);
  }

  let html: string;
  try {
    html = await readCapped(response, options.maxBytes ?? DEFAULT_MAX_BYTES);
  } catch {
    return await giveUp('unreachable', resolvedUrl);
  }

  if (looksLikeRobotCheck(html)) return await giveUp('blocked', resolvedUrl);

  const details = parseAmazonProductHtml(html);
  const complete = Boolean(details.title && details.imageUrl);
  return { outcome: complete ? 'ok' : 'partial', resolvedUrl, details };
}

/**
 * Short links carry nothing readable — no ASIN, no product name — so following
 * one is the difference between a pick called "Garden Shears" and a pick
 * called "Amazon pick". The page read above already walks the redirects, so
 * this is the second try for a link whose page could not be read at all: the
 * address is worth having on its own, because it is what names the pick and
 * what makes two share codes for one product meet.
 */
export async function resolveShortAmazonLink(
  rawUrl: string,
  options: LookupOptions = {}
): Promise<string> {
  const trimmed = String(rawUrl || '').trim();
  if (!isShortAmazonLink(trimmed)) return trimmed;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return trimmed;

  const reached = await fetchFollowingAmazon(
    trimmed,
    fetchImpl,
    'HEAD',
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  // Cancelling rather than reading: only the address was ever wanted.
  if ('response' in reached) await reached.response.body?.cancel().catch(() => {});

  const landed = reached.url;
  const usable =
    isAmazonLink(landed) && !isShortAmazonLink(landed) && isProductDestination(trimmed, landed);
  return usable ? landed : trimmed;
}
