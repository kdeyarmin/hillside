/**
 * Shared shop / care / site-search matching.
 *
 * Prisma `contains` and `String.includes` are substring matches. Searching
 * "tea" therefore used to return a Monstera care guide whose summary said
 * "steady watering". Shoppers looking for tea should not land on a houseplant
 * because three letters happen to sit inside another word.
 *
 * Start-of-word is the rule that fits a plant shop: "tea" still matches
 * "teas", "teapot" and "tea-cup", and "water" still matches "watering", but
 * "tea" will not match "steady" or "instead". Accented letters stay letters:
 * searching "café" still finds "Café blend", not a substring of another word.
 */

export const SEARCH_CANDIDATE_LIMIT = 80;
export const SEARCH_RESULT_LIMIT = 12;

export function normalizeSearchTerm(value: string) {
  return value.trim().slice(0, 120);
}

export function tokenizeSearch(term: string): string[] {
  const normalized = normalizeSearchTerm(term).toLowerCase();
  if (!normalized) return [];

  const tokens = normalized.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 2);
  if (tokens.length) return tokens;

  // A single letter such as "z" should still find "ZZ plant".
  if (/^[\p{L}\p{N}]$/u.test(normalized)) return [normalized];
  return [];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function startsAWord(haystack: string, token: string) {
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(token)}`, 'iu').test(haystack);
}

export function matchesSearchTerm(haystack: string | null | undefined, term: string) {
  const tokens = tokenizeSearch(term);
  if (!tokens.length) return false;
  const text = haystack || '';
  return tokens.every((token) => startsAWord(text, token));
}

export function matchesAnySearchField(fields: Array<string | null | undefined>, term: string) {
  return matchesSearchTerm(fields.filter(Boolean).join('\n'), term);
}

export function filterSearchHits<T>(
  items: T[],
  fieldsFor: (item: T) => Array<string | null | undefined>,
  term: string,
  limit = SEARCH_RESULT_LIMIT
) {
  return items.filter((item) => matchesAnySearchField(fieldsFor(item), term)).slice(0, limit);
}

/**
 * Typo tolerance.
 *
 * Shoppers arrive typing "monstara", "succulant" and "carnivorus", and a shop
 * this size cannot answer them with a search index — so a bounded edit distance
 * against the words already on the page does the job.
 *
 * The length floor is load-bearing rather than a tuning knob: at three letters
 * almost everything is one edit from something else, and allowing it would put
 * "sea", "team" and "tear" back into the results for "tea" — exactly the noise
 * the start-of-word rule above was written to remove.
 */
export const FUZZY_MIN_LENGTH = 4;
export const FUZZY_LONG_LENGTH = 8;

function fuzzyAllowance(token: string) {
  if (token.length >= FUZZY_LONG_LENGTH) return 2;
  if (token.length >= FUZZY_MIN_LENGTH) return 1;
  return 0;
}

/**
 * Levenshtein distance, abandoned as soon as it cannot come in at or under
 * `max`. Bounded because this runs per token per word per product in the
 * browser, and the answer "further than 2" is worth exactly as much as "17".
 */
export function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      current.push(value);
      if (value < rowBest) rowBest = value;
    }
    // Every remaining row can only add to the best value in this one.
    if (rowBest > max) return false;
    previous = current;
  }
  return previous[b.length] <= max;
}

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * The same word-aware match as `matchesSearchTerm`, but a token that finds
 * nothing is given one more chance against each word in the text within its
 * edit-distance allowance. Exact and prefix hits are still preferred — fuzzy is
 * only ever a fallback, so a real match can never be displaced by a near one.
 */
export function matchesSearchTermFuzzy(haystack: string | null | undefined, term: string) {
  const tokens = tokenizeSearch(term);
  if (!tokens.length) return false;
  const text = haystack || '';
  const words = tokens.some((token) => fuzzyAllowance(token) > 0) ? wordsOf(text) : [];

  return tokens.every((token) => {
    if (startsAWord(text, token)) return true;
    const allowance = fuzzyAllowance(token);
    if (!allowance) return false;
    return words.some((word) => editDistanceWithin(token, word, allowance));
  });
}

export function matchesAnySearchFieldFuzzy(fields: Array<string | null | undefined>, term: string) {
  return matchesSearchTermFuzzy(fields.filter(Boolean).join('\n'), term);
}

/**
 * How well an item answers the search, so the results page can lead with the
 * product whose *name* is what was typed rather than the one that mentions it in
 * the third paragraph. Zero means no match at all.
 *
 * `primary` is the field a shopper thinks they are searching — a product name, a
 * plant name — and `secondary` is everything else that should still be findable.
 */
export function searchScore(
  primary: Array<string | null | undefined>,
  secondary: Array<string | null | undefined>,
  term: string
): number {
  const tokens = tokenizeSearch(term);
  if (!tokens.length) return 0;

  const primaryText = primary.filter(Boolean).join('\n');
  const everything = [...primary, ...secondary].filter(Boolean).join('\n');
  if (!matchesSearchTermFuzzy(everything, term)) return 0;

  let score = 1;
  const normalized = normalizeSearchTerm(term).toLowerCase();
  const primaryLower = primaryText.toLowerCase();

  if (primaryLower === normalized) score += 100;
  else if (primaryLower.startsWith(normalized)) score += 60;
  if (matchesSearchTerm(primaryText, term)) score += 30;
  // Every token landing exactly beats a set that needed the fuzzy fallback.
  if (matchesSearchTerm(everything, term)) score += 10;
  score += tokens.filter((token) => startsAWord(primaryText, token)).length;

  return score;
}

/**
 * Search hits, best first. `filterSearchHits` above keeps input order on
 * purpose — a shop grid already has a sort — so ranking is its own function
 * rather than a flag, and the site-wide results page uses this one.
 */
export function rankSearchHits<T>(
  items: T[],
  fieldsFor: (item: T) => {
    primary: Array<string | null | undefined>;
    secondary: Array<string | null | undefined>;
  },
  term: string,
  limit = SEARCH_RESULT_LIMIT
): T[] {
  return items
    .map((item) => {
      const { primary, secondary } = fieldsFor(item);
      return { item, score: searchScore(primary, secondary, term) };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}
