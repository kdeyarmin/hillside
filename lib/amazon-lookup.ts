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

  let response: Response;
  try {
    response = await fetchImpl(pasted, {
      redirect: 'follow',
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    });
  } catch {
    return { outcome: 'unreachable', resolvedUrl: pasted, details: { ...EMPTY_DETAILS } };
  }

  /**
   * A short link is only worth anything once it has been followed, so the
   * address we ended up at is what the pick is built from. When the fetch
   * fails we keep the pasted link — a dead `amzn.to` is still the owner's link.
   */
  const resolvedUrl = response.url && isAmazonLink(response.url) ? response.url : pasted;

  if (!response.ok) {
    // 503 with a captcha body is Amazon's usual way of refusing a server.
    const refused = response.status === 403 || response.status === 503 || response.status === 429;
    return {
      outcome: refused ? 'blocked' : 'unreachable',
      resolvedUrl,
      details: { ...EMPTY_DETAILS }
    };
  }

  let html: string;
  try {
    html = await readCapped(response, options.maxBytes ?? DEFAULT_MAX_BYTES);
  } catch {
    return { outcome: 'unreachable', resolvedUrl, details: { ...EMPTY_DETAILS } };
  }

  if (looksLikeRobotCheck(html)) {
    return { outcome: 'blocked', resolvedUrl, details: { ...EMPTY_DETAILS } };
  }

  const details = parseAmazonProductHtml(html);
  const complete = Boolean(details.title && details.imageUrl);
  return { outcome: complete ? 'ok' : 'partial', resolvedUrl, details };
}

/**
 * Short links carry nothing readable — no ASIN, no product name — so following
 * one is the difference between a pick called "Garden Shears" and a pick
 * called "Amazon pick". The page fetch above already follows redirects, so
 * this only runs when the lookup itself could not be made.
 */
export async function resolveShortAmazonLink(
  rawUrl: string,
  options: LookupOptions = {}
): Promise<string> {
  if (!isShortAmazonLink(rawUrl)) return String(rawUrl || '').trim();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return rawUrl;

  try {
    const response = await fetchImpl(rawUrl, {
      method: 'HEAD',
      redirect: 'follow',
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    });
    return response.url && isAmazonLink(response.url) ? response.url : rawUrl;
  } catch {
    return rawUrl;
  }
}
