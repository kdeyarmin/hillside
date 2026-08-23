/**
 * How finished a product listing is, checked against what its *kind* of product
 * actually needs.
 *
 * A plant needs a pot size, a light and water line and an answer about pets. A
 * tea needs net contents, an ingredient list, brewing instructions and whether
 * it will keep you up. Checking every product against one list would either
 * nag about pot sizes on soap or let a tea go out with no ingredients on it, so
 * the list is assembled per type.
 *
 * Three separate things come out of this, and keeping them apart is the point:
 *
 *   scored     everything on the checklist, which is what the percentage counts
 *   required   what "ready to publish" means — advisory, never blocks a save
 *   blocking   the two or three facts a regulated consumer good may not be sold
 *              without, which *do* stop it going public
 *
 * Tammy can always save. A half-written listing with one photograph is a draft,
 * and drafts are how the work gets done — being refused at the save button is
 * how the work stops. The only refusal here is publishing a tea or a lotion with
 * no net weight and no ingredients, which is not a matter of taste.
 */

import { inventoryStatusValue, type InventoryStatusValue } from './inventory.ts';
import { specKindFor } from './product-categories.ts';
import { photoStatus } from './product-photos.ts';
import { readProductSpecs, specValue } from './product-specs.ts';

export type CompletenessProduct = {
  name?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  details?: string | null;
  sku?: string | null;
  type?: string | null;
  priceCents?: number | null;
  inventory?: number | null;
  inventoryStatus?: InventoryStatusValue | string | null;
  imageUrl?: string | null;
  ships?: boolean | null;
  pickup?: boolean | null;
  active?: boolean | null;
  /**
   * The structured facts, read through the same registry the form writes and the
   * product page renders. Checking a separate set of columns here is how the
   * checklist and the form drift into disagreeing about whether a tea has its
   * ingredients on it.
   */
  specs?: unknown;
  category?: { specKind?: string | null } | null;
};

export type CompletenessCheck = {
  key: string;
  label: string;
  present: boolean;
  /** Part of what "ready to publish" means. Advisory — a save is never refused. */
  required: boolean;
  /** A fact this kind of product may not be sold publicly without. */
  blocking: boolean;
  /** Where in the form to go and fix it. */
  hint: string;
};

/** Draft while it is unfinished, ready once it is, published once it is live. */
export type PublishState = 'draft' | 'ready' | 'published';

export type Completeness = {
  checks: CompletenessCheck[];
  missing: CompletenessCheck[];
  missingRequired: CompletenessCheck[];
  /** Missing facts that stop this product being sold publicly. */
  blockers: CompletenessCheck[];
  /** 0–100, over every check on this product's list. */
  score: number;
  /** Nothing required is missing. */
  ready: boolean;
  /** Nothing *blocking* is missing, so it may be listed. */
  publishable: boolean;
  state: PublishState;
};

/**
 * Kinds of product sold as consumables or as things people put on their skin.
 *
 * These are the ones where the missing information is not a marketing gap but a
 * disclosure a buyer needs before deciding: what is in it, and how much of it is
 * there. Plants and tea infusers are not in this set — an unfinished plant
 * listing is merely unfinished.
 *
 * Keyed on the spec kind rather than the legacy `ProductType`, so a category the
 * owner adds later is regulated because of the questions it asks, not because of
 * which of six broad types it happens to count as.
 */
export const REGULATED_SPEC_KINDS = ['TEA', 'LOTION', 'SOAP'];

export function isRegulatedProduct(product: CompletenessProduct) {
  return REGULATED_SPEC_KINDS.includes(resolveSpecKind(product));
}

function resolveSpecKind(product: CompletenessProduct) {
  return specKindFor({
    type: String(product.type || 'OTHER'),
    category: product.category?.specKind ? { specKind: product.category.specKind as never } : null
  });
}

const filled = (value: string | null | undefined) => Boolean(value?.trim());

function check(
  key: string,
  label: string,
  present: boolean,
  hint: string,
  options: { required?: boolean; blocking?: boolean } = {}
): CompletenessCheck {
  return {
    key,
    label,
    present,
    hint,
    required: options.blocking || options.required || false,
    blocking: options.blocking || false
  };
}

function checksFor(product: CompletenessProduct): CompletenessCheck[] {
  const kind = resolveSpecKind(product);
  const specs = readProductSpecs(product.specs);
  const spec = (key: string) => specValue(specs, key);
  const status = inventoryStatusValue(product.inventoryStatus);

  const common = [
    check('name', 'Name', filled(product.name), 'Product name', { required: true }),
    check(
      'price',
      'Price',
      typeof product.priceCents === 'number' && product.priceCents > 0,
      'Price',
      { required: true }
    ),
    check(
      'inventory',
      'Quantity on hand',
      // A count of zero is only a gap when nothing else explains it. A lotion
      // made to order, a seasonal wreath and something already reordered are all
      // legitimately empty, and their status says so.
      (product.inventory ?? 0) > 0 || status !== 'STOCKED',
      'Quantity on hand, or an inventory status that explains the empty shelf'
    ),
    check('sku', 'SKU', filled(product.sku), 'SKU / item number', { required: true }),
    check(
      'mainPhoto',
      'Main photograph',
      photoStatus(product.imageUrl) === 'own',
      'A photograph of this product, not the shared category artwork',
      { required: true }
    ),
    check('description', 'Description', filled(product.description), 'Main description', {
      required: true
    }),
    check(
      'shortDescription',
      'Card description',
      filled(product.shortDescription),
      'Short card description — the line under the name in the shop'
    ),
    check(
      'fulfillment',
      'Shipping or pickup',
      Boolean(product.ships) || Boolean(product.pickup),
      'Tick Ships, Local pickup, or both',
      { required: true }
    )
  ];

  if (kind === 'PLANT' || kind === 'CARNIVOROUS_PLANT') {
    return [
      ...common,
      check('potSize', 'Pot size', filled(spec('potSize')), 'Pot size', { required: true }),
      check('light', 'Light', filled(spec('light')), 'Light', { required: true }),
      check('water', 'Water', filled(spec('water')), 'Water', { required: true }),
      check(
        'petSafety',
        'Pet safety',
        filled(spec('petSafety')),
        'Pet safety — answer it either way; "unanswered" is what customers ask about',
        { required: true }
      )
    ];
  }

  if (kind === 'TEA') {
    return [
      ...common,
      check('netWeight', 'Net weight', filled(spec('netWeight')), 'Net weight or contents', {
        blocking: true
      }),
      check('ingredients', 'Ingredients', filled(spec('ingredients')), 'Ingredients', {
        blocking: true
      }),
      check('brewing', 'Brewing instructions', filled(spec('steepTime')), 'Steep time', {
        required: true
      }),
      check('caffeine', 'Caffeine status', filled(spec('caffeine')), 'Caffeine', {
        required: true
      })
    ];
  }

  // A bar is weighed and a jar is measured, so the net-contents field each one
  // is asked for differs — but the disclosure is the same one, and so is the
  // refusal to publish without it.
  if (kind === 'SOAP' || kind === 'LOTION') {
    const netKey = kind === 'LOTION' ? 'netVolume' : 'netWeight';
    return [
      ...common,
      check(
        'netWeight',
        kind === 'LOTION' ? 'Net volume' : 'Net weight',
        filled(spec(netKey)),
        'Net weight or contents',
        { blocking: true }
      ),
      check('ingredients', 'Ingredients', filled(spec('ingredients')), 'Ingredients', {
        blocking: true
      })
    ];
  }

  return [
    ...common,
    check(
      'details',
      'Details or contents',
      filled(product.details) || filled(spec('uses')) || filled(spec('material')),
      'Product details, materials or what it is for'
    )
  ];
}

export function productCompleteness(product: CompletenessProduct): Completeness {
  const checks = checksFor(product);
  const missing = checks.filter((entry) => !entry.present);
  const missingRequired = missing.filter((entry) => entry.required);
  const blockers = missing.filter((entry) => entry.blocking);
  const ready = missingRequired.length === 0;

  return {
    checks,
    missing,
    missingRequired,
    blockers,
    score: Math.round(((checks.length - missing.length) / checks.length) * 100),
    ready,
    publishable: blockers.length === 0,
    state: product.active ? 'published' : ready ? 'ready' : 'draft'
  };
}

export const PUBLISH_STATE_LABELS: Record<PublishState, string> = {
  draft: 'Draft',
  ready: 'Ready to publish',
  published: 'Published'
};

/**
 * A published listing that is still missing required information. Worth its own
 * name because it is the case the three-state label cannot show: it is live, so
 * it reads "Published", and the gap is invisible unless something says so.
 */
export function publishedIncomplete(completeness: Completeness) {
  return completeness.state === 'published' && completeness.missingRequired.length > 0;
}

/**
 * Why this product cannot be listed publicly yet, in a sentence Tammy can act
 * on, or null when nothing stands in the way.
 */
export function publishBlockReason(product: CompletenessProduct) {
  if (!isRegulatedProduct(product)) return null;
  const { blockers } = productCompleteness(product);
  if (!blockers.length) return null;
  const names = blockers.map((entry) => entry.label.toLowerCase());
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `Add the ${list} before listing this for sale. It is saved as a draft.`;
}
