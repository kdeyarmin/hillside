/**
 * Parsing for the bundle editor.
 *
 * Kept free of Next and Prisma so `npm test` can cover the rules Tammy actually
 * hits — a recipe line with no product, a sized product with no variant chosen,
 * the same product listed twice — without a server action or a database.
 */

import { MAX_BUNDLE_ITEMS, MAX_BUNDLE_ITEM_QUANTITY } from './bundles.ts';
import { normalizeSizeLabel } from './product-sizes.ts';

export type BundleItemInput = {
  productId: string;
  size: string | null;
  quantity: number;
  optional: boolean;
  note: string | null;
  sortOrder: number;
};

export type BundleFields = {
  slug: string;
  title: string;
  tagline: string | null;
  description: string;
  imageUrl: string | null;
  galleryImages: string[];
  priceCents: number;
  badge: string | null;
  active: boolean;
  featured: boolean;
  sortOrder: number;
};

export type ParsedBundle =
  | { ok: true; id: string; data: BundleFields; items: BundleItemInput[] }
  | { ok: false; reason: 'required' | 'no-items'; id: string; slug: string };

function text(form: FormData, name: string) {
  return String(form.get(name) || '').trim();
}

function checkedAt(form: FormData, name: string, index: number) {
  return form.get(`${name}-${index}`) === 'on' || form.get(`${name}-${index}`) === 'true';
}

export function slugifyBundle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * The recipe, read off the numbered rows the editor renders.
 *
 * Rows without a product are dropped rather than rejected: the form always
 * offers a few blank rows to add to, and making an untouched one an error would
 * mean Tammy could never save a three-item set from a five-row form.
 *
 * The same product in the same variant twice is folded into one line with the
 * quantities added, because two rows against one shelf are indistinguishable
 * once the set is packed — and two identical lines would have been checked and
 * decremented separately.
 */
export function parseBundleItems(form: FormData): BundleItemInput[] {
  const merged = new Map<string, BundleItemInput>();

  for (let index = 0; index < MAX_BUNDLE_ITEMS * 2; index += 1) {
    const productId = text(form, `itemProductId-${index}`);
    if (!productId) continue;

    const size = normalizeSizeLabel(text(form, `itemSize-${index}`)) || null;
    const quantity = Math.max(
      1,
      Math.min(MAX_BUNDLE_ITEM_QUANTITY, Math.floor(Number(form.get(`itemQuantity-${index}`)) || 1))
    );
    const key = `${productId}::${size ?? ''}`;
    const existing = merged.get(key);
    merged.set(key, {
      productId,
      size,
      quantity: Math.min(MAX_BUNDLE_ITEM_QUANTITY, (existing?.quantity || 0) + quantity),
      // Folded rows keep the stricter reading: a product listed once as required
      // is required, whatever a duplicate row said.
      optional: (existing?.optional ?? true) && checkedAt(form, 'itemOptional', index),
      note: existing?.note || text(form, `itemNote-${index}`) || null,
      sortOrder: existing?.sortOrder ?? merged.size
    });
    if (merged.size >= MAX_BUNDLE_ITEMS) break;
  }

  return [...merged.values()].map((item, index) => ({ ...item, sortOrder: index }));
}

export function parseBundleInput(form: FormData): ParsedBundle {
  const id = text(form, 'id');
  const title = text(form, 'title');
  const slug = slugifyBundle(text(form, 'slug')) || slugifyBundle(title);
  const description = text(form, 'description');
  const priceRaw = Number(form.get('price'));
  const priceCents = Number.isFinite(priceRaw) ? Math.max(0, Math.round(priceRaw * 100)) : 0;

  if (!title || !slug || !description) {
    return { ok: false, reason: 'required', id, slug };
  }

  const items = parseBundleItems(form);
  /**
   * A set has to contain something the shop can take off a shelf. Saved empty it
   * would be a page offering a box of nothing, and — because availability is the
   * minimum over the required components — it would also be permanently
   * unavailable with no visible reason why.
   */
  if (!items.some((item) => !item.optional)) {
    return { ok: false, reason: 'no-items', id, slug };
  }

  return {
    ok: true,
    id,
    data: {
      slug,
      title,
      tagline: text(form, 'tagline') || null,
      description,
      imageUrl: text(form, 'imageUrl') || null,
      galleryImages: text(form, 'galleryImages')
        .split(/[\n,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 8),
      priceCents,
      badge: text(form, 'badge') || null,
      active: form.get('active') === 'on' || form.get('active') === 'true',
      featured: form.get('featured') === 'on' || form.get('featured') === 'true',
      sortOrder: Math.floor(Number(form.get('sortOrder')) || 0)
    },
    items
  };
}
