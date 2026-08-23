/**
 * The editorial content a category page carries: its introduction, its longer
 * copy and its questions.
 *
 * A category page that is a heading over a product grid is worth nothing to a
 * shopper deciding between a pitcher plant and a sundew, and worth nothing to a
 * search engine either — there is no page there, only a filter. So a collection
 * can hold real writing, and this file is how that writing gets in and out of
 * the database safely: parsing what Tammy types in the dashboard, and turning it
 * back into blocks the page can render.
 *
 * Pure, so `npm test` covers the parsing that stands between a textarea and a
 * published page.
 */

export type FaqEntry = { question: string; answer: string };

export const FAQ_MAX_ENTRIES = 12;
export const FAQ_QUESTION_MAX = 200;
export const FAQ_ANSWER_MAX = 1200;

/**
 * FAQs as stored: `[{ question, answer }]`. Anything else in the column — an
 * older shape, a hand-edited row, null — reads as no FAQs rather than throwing
 * on a page a shopper asked for.
 */
export function readFaq(value: unknown): FaqEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: FaqEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const question = typeof record.question === 'string' ? record.question.trim() : '';
    const answer = typeof record.answer === 'string' ? record.answer.trim() : '';
    if (!question || !answer) continue;
    entries.push({
      question: question.slice(0, FAQ_QUESTION_MAX),
      answer: answer.slice(0, FAQ_ANSWER_MAX)
    });
    if (entries.length >= FAQ_MAX_ENTRIES) break;
  }
  return entries;
}

/**
 * One question per line, `question | answer`, which is the same shape the size
 * editor already uses — so the dashboard has one convention rather than two.
 * A line with no separator is a question nobody answered, and is dropped rather
 * than published with an empty answer: an FAQ entry with no answer is invalid
 * structured data and useless copy.
 */
export function parseFaqLines(text: string): FaqEntry[] {
  return readFaq(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('|');
        if (separator === -1) return null;
        return {
          question: line.slice(0, separator).trim(),
          answer: line.slice(separator + 1).trim()
        };
      })
      .filter(Boolean)
  );
}

/** The stored FAQs back as editable lines. */
export function faqLines(value: unknown): string {
  return readFaq(value)
    .map((entry) => `${entry.question} | ${entry.answer}`)
    .join('\n');
}

export type ProseBlock = { kind: 'heading' | 'paragraph'; text: string };

/**
 * Owner-typed copy as renderable blocks.
 *
 * Blank lines separate paragraphs, and a short line ending in a colon becomes a
 * subheading — which is the whole formatting vocabulary, because the alternative
 * is asking someone who runs a plant shop to write HTML or Markdown in a
 * textarea. Nothing here is rendered as markup, so what she types is what
 * appears; React escapes it on the way out.
 */
export function proseBlocks(text: string | null | undefined): ProseBlock[] {
  if (!text?.trim()) return [];
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const isHeading = block.length <= 80 && block.endsWith(':') && !block.includes('\n');
      return {
        kind: isHeading ? ('heading' as const) : ('paragraph' as const),
        text: isHeading ? block.slice(0, -1) : block
      };
    });
}

/** Words a category should be findable by, cleaned up for storage. */
export function parseKeywords(text: string, limit = 20): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const raw of text.split(/[\n,]+/)) {
    const value = raw.trim().toLowerCase().slice(0, 60);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    keywords.push(value);
    if (keywords.length >= limit) break;
  }
  return keywords;
}

/**
 * The description a category or collection page publishes, in the order of what
 * is most specific to it. Truncated on a word boundary because a meta
 * description cut mid-word reads as broken rather than as abridged.
 *
 * The last-resort sentence names neither noun: it serves both kinds of grouping,
 * and a category with no copy of its own used to describe itself as a
 * collection.
 */
export function categoryDescription(collection: {
  title: string;
  metaDescription?: string | null;
  intro?: string | null;
  description?: string | null;
  tagline?: string | null;
}): string {
  const candidate =
    collection.metaDescription?.trim() ||
    collection.intro?.trim() ||
    collection.description?.trim() ||
    collection.tagline?.trim() ||
    `Shop ${collection.title} at The Hillside Gardens in Ebensburg, Pennsylvania.`;

  const flat = candidate.replace(/\s+/g, ' ');
  if (flat.length <= 160) return flat;
  const cut = flat.slice(0, 157);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : cut.length)}…`;
}
