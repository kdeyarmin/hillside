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
