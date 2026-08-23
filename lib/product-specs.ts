/**
 * Structured, category-specific product information.
 *
 * A plant, a tea and a bag of terrarium gravel do not describe themselves the
 * same way, and forcing all three through one "Product details" textarea is how
 * a shop ends up with a monstera listing that never says what pot it is in and
 * a tea listing that never says whether it has caffeine in it. So each spec
 * kind — chosen by the product's category — asks for its own fields, and only
 * those fields appear on the admin form and on the product page.
 *
 * The registry below is the single definition of them. The admin form renders
 * from it, the save reads from it, and the public specification table renders
 * from it again, so a field can be added in one place and appear correctly in
 * all three. Values are stored in `Product.specs` as `{ fieldKey: value }`.
 *
 * Everything is optional, always. A field with nothing in it is not rendered,
 * so a listing says what Tammy knows and stays quiet about the rest rather than
 * printing a table of blanks.
 */

import type { ProductSpecKind } from '@prisma/client';

export type SpecField = {
  key: string;
  label: string;
  /** A long value — an ingredient list — that needs a textarea and more room. */
  long?: boolean;
  placeholder?: string;
  /**
   * Offered in a datalist rather than a dropdown. The common answers are two
   * keystrokes away, and an answer nobody anticipated is still typeable —
   * "bright indirect, tolerates a north window" is a real light requirement and
   * a `<select>` would have made it unsayable.
   */
  suggestions?: string[];
  hint?: string;
};

export type SpecGroup = { title: string; hint?: string; fields: SpecField[] };

/** A single-line value's ceiling. Long fields get much more room. */
export const SPEC_VALUE_MAX = 200;
export const SPEC_LONG_VALUE_MAX = 2000;
/** A ceiling on stored keys, so a hand-edited column cannot grow without end. */
export const SPEC_KEY_LIMIT = 80;

const PLANT_IDENTITY: SpecGroup = {
  title: 'What it is',
  fields: [
    {
      key: 'botanicalName',
      label: 'Botanical name',
      placeholder: 'Epipremnum aureum'
    },
    {
      key: 'matureSize',
      label: 'Mature size',
      placeholder: 'Trails to 6 ft indoors',
      hint: 'How big it gets in time, not how big it is today.'
    },
    {
      key: 'growthHabit',
      label: 'Growth habit',
      placeholder: 'Trailing',
      suggestions: ['Upright', 'Trailing', 'Climbing', 'Rosette', 'Clumping', 'Spreading', 'Bushy']
    }
  ]
};

const PLANT_AS_SOLD: SpecGroup = {
  title: 'The plant you receive',
  hint: 'What is on the bench today. Sold in more than one pot? Leave these blank and describe each pot in the variants below instead.',
  fields: [
    { key: 'potSize', label: 'Pot size', placeholder: '6" pot' },
    {
      key: 'potStyle',
      label: 'Nursery pot or decorative planter',
      placeholder: 'Nursery pot',
      suggestions: [
        'Nursery pot',
        'Decorative planter',
        'Decorative planter with drainage',
        'Bare root',
        'No pot — mounted'
      ]
    },
    { key: 'plantHeight', label: 'Approximate height', placeholder: '10–14 in including the pot' },
    { key: 'plantWidth', label: 'Approximate width', placeholder: '8–10 in across' }
  ]
};

const PLANT_CARE: SpecGroup = {
  title: 'Care at a glance',
  fields: [
    {
      key: 'light',
      label: 'Light',
      placeholder: 'Bright indirect light',
      suggestions: [
        'Bright direct light',
        'Bright indirect light',
        'Medium indirect light',
        'Low to medium light',
        'Tolerates low light',
        'Full sun',
        'Partial shade'
      ]
    },
    {
      key: 'water',
      label: 'Water',
      placeholder: 'Water when the top inch is dry',
      suggestions: [
        'Water when the top inch is dry',
        'Water when the top half is dry',
        'Keep evenly moist',
        'Keep constantly wet',
        'Let dry out completely between waterings',
        'Soak weekly, then drain fully'
      ]
    },
    {
      key: 'humidity',
      label: 'Humidity',
      placeholder: 'Average room humidity is fine',
      suggestions: [
        'Average room humidity is fine',
        'Prefers higher humidity',
        'Needs high humidity — 50%+',
        'Tolerates dry air'
      ]
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      placeholder: 'Easy',
      suggestions: ['Easy', 'Beginner friendly', 'Moderate', 'Needs attention', 'Advanced']
    },
    {
      key: 'petSafety',
      label: 'Pet safety',
      placeholder: 'Toxic to cats and dogs if eaten',
      suggestions: [
        'Pet friendly — non-toxic to cats and dogs',
        'Toxic to cats and dogs if eaten',
        'Keep away from pets',
        'Not known to be toxic'
      ],
      hint: 'Say plainly whether it is safe around animals. “Unknown” is a better answer than nothing.'
    },
    {
      key: 'placement',
      label: 'Indoor or outdoor',
      placeholder: 'Indoors year round',
      suggestions: [
        'Indoors year round',
        'Indoors, outdoors in summer',
        'Outdoors',
        'Indoors or outdoors',
        'Outdoors in shade'
      ]
    }
  ]
};

const CARNIVOROUS_CARE: SpecGroup = {
  title: 'Carnivorous care',
  fields: [
    { key: 'species', label: 'Species', placeholder: 'Dionaea muscipula “Typical”' },
    {
      key: 'dormancy',
      label: 'Dormancy',
      long: true,
      placeholder:
        'Needs 3–4 months of winter dormancy at 35–50°F. Traps die back; that is normal.',
      hint: 'The single most common way a flytrap is lost. Say what has to happen and when.'
    },
    {
      key: 'waterType',
      label: 'Water type',
      placeholder: 'Distilled or rainwater only',
      suggestions: [
        'Distilled or rainwater only',
        'Distilled, rain or reverse-osmosis water only',
        'Never tap water — under 50 ppm dissolved solids'
      ]
    },
    {
      key: 'growingMedium',
      label: 'Growing medium',
      placeholder: 'Sphagnum peat and perlite, no fertiliser',
      suggestions: [
        'Sphagnum peat and perlite, no fertiliser',
        'Long-fibre sphagnum moss',
        'Peat, sand and perlite mix',
        'Live sphagnum'
      ]
    },
    {
      key: 'feeding',
      label: 'Feeding',
      long: true,
      placeholder: 'Feeds itself outdoors. Indoors, one small insect per trap every few weeks.'
    }
  ]
};

const TEA_CONTENTS: SpecGroup = {
  title: 'What is in the tin',
  fields: [
    { key: 'netWeight', label: 'Net weight', placeholder: '2 oz (57 g)' },
    {
      key: 'ingredients',
      label: 'Ingredients',
      long: true,
      placeholder: 'Organic rooibos, dried orange peel, cinnamon bark, whole cloves',
      hint: 'Every ingredient, in order, exactly as it goes on the label.'
    },
    {
      key: 'allergens',
      label: 'Allergen information',
      placeholder: 'Packed in a kitchen that also handles tree nuts',
      hint: 'Say what it contains and what it is packed alongside.'
    }
  ]
};

const TEA_BREWING: SpecGroup = {
  title: 'Brewing',
  fields: [
    {
      key: 'caffeine',
      label: 'Caffeine',
      placeholder: 'Naturally caffeine free',
      suggestions: [
        'Naturally caffeine free',
        'Caffeinated',
        'Lightly caffeinated',
        'Decaffeinated'
      ]
    },
    { key: 'servingSize', label: 'Serving size', placeholder: '1 heaping tsp per 8 oz' },
    { key: 'servings', label: 'Approximate servings', placeholder: 'About 25 cups' },
    { key: 'brewTemperature', label: 'Brewing temperature', placeholder: '208°F / 98°C' },
    { key: 'steepTime', label: 'Steep time', placeholder: '5–7 minutes' }
  ]
};

const SOAP_BAR: SpecGroup = {
  title: 'The bar',
  fields: [
    { key: 'netWeight', label: 'Net weight', placeholder: '4.5 oz (128 g)' },
    { key: 'scent', label: 'Scent', placeholder: 'Lavender and cedarwood' }
  ]
};

const SOAP_MAKEUP: SpecGroup = {
  title: 'Ingredients and skin',
  fields: [
    {
      key: 'ingredients',
      label: 'Complete ingredient list',
      long: true,
      placeholder:
        'Saponified olive oil, coconut oil, shea butter, castor oil; lavender essential oil; French green clay',
      hint: 'The full list, in order. This is what a customer with a sensitivity reads.'
    },
    {
      key: 'skinUse',
      label: 'Skin and use',
      long: true,
      placeholder: 'A gentle everyday bar for hands and body. Not for the face.'
    }
  ]
};

const LOTION_JAR: SpecGroup = {
  title: 'The jar',
  fields: [
    { key: 'netVolume', label: 'Net volume', placeholder: '4 fl oz (118 ml)' },
    { key: 'scent', label: 'Scent', placeholder: 'Unscented' }
  ]
};

const LOTION_MAKEUP: SpecGroup = {
  title: 'Ingredients',
  fields: [
    {
      key: 'ingredients',
      label: 'Ingredients',
      long: true,
      placeholder: 'Distilled water, shea butter, sweet almond oil, emulsifying wax, vitamin E',
      hint: 'The full list, in order.'
    }
  ]
};

const LOTION_USE: SpecGroup = {
  title: 'How to use it',
  fields: [
    {
      key: 'directions',
      label: 'Directions',
      long: true,
      placeholder: 'Warm a small amount between the hands and massage in. Reapply as needed.'
    },
    {
      key: 'warnings',
      label: 'Warnings',
      long: true,
      placeholder: 'For external use only. Discontinue if irritation occurs. Keep out of eyes.',
      hint: 'Anything a customer needs told before they use it.'
    }
  ]
};

const HARD_GOOD_MEASUREMENTS: SpecGroup = {
  title: 'Size and material',
  fields: [
    { key: 'dimensions', label: 'Dimensions', placeholder: '6 in wide × 5.5 in tall' },
    {
      key: 'packageSize',
      label: 'Quantity or package size',
      placeholder: '1 quart bag / set of 3'
    },
    { key: 'material', label: 'Material', placeholder: 'Stoneware with a matte glaze' }
  ]
};

const HARD_GOOD_USES: SpecGroup = {
  title: 'What it is for',
  fields: [
    {
      key: 'uses',
      label: 'Appropriate uses',
      long: true,
      placeholder: 'A drainage layer for closed terrariums, or a top dressing for potted plants.'
    }
  ]
};

const STORAGE_TEA: SpecGroup = {
  title: 'Keeping it',
  fields: [
    {
      key: 'storage',
      label: 'Storage',
      long: true,
      placeholder: 'Keep sealed, away from light and heat. Best within a year of opening.'
    }
  ]
};

const STORAGE_BODYCARE: SpecGroup = {
  title: 'Storing it',
  fields: [
    {
      key: 'storage',
      label: 'Storage and use',
      long: true,
      placeholder: 'Keep on a draining dish between uses so the bar dries out and lasts longer.'
    }
  ]
};

/**
 * Asked of everything. A shipping restriction is not a plant-only fact — a
 * glass cloche and a jar of lotion both have things that cannot be said in the
 * flat-rate blurb — and putting it in one shared group keeps it in one place.
 * Whether local pickup is offered is the product's own checkbox rather than a
 * field here, so there is only ever one answer to it.
 */
const SHIPPING: SpecGroup = {
  title: 'Shipping',
  hint: 'Whether this ships at all, and whether pickup is offered, are the checkboxes at the bottom of this form.',
  fields: [
    {
      key: 'shippingRestrictions',
      label: 'Shipping restrictions',
      long: true,
      placeholder: 'Held back when overnight lows are under 40°F along the route.',
      hint: 'Weather holds, states we cannot ship to, anything that delays a shipment.'
    }
  ]
};

const PLANT_GROUPS = [PLANT_IDENTITY, PLANT_AS_SOLD, PLANT_CARE];

export const SPEC_GROUPS: Record<ProductSpecKind, SpecGroup[]> = {
  PLANT: [...PLANT_GROUPS, SHIPPING],
  CARNIVOROUS_PLANT: [...PLANT_GROUPS, CARNIVOROUS_CARE, SHIPPING],
  TEA: [TEA_CONTENTS, TEA_BREWING, STORAGE_TEA, SHIPPING],
  SOAP: [SOAP_BAR, SOAP_MAKEUP, STORAGE_BODYCARE, SHIPPING],
  LOTION: [LOTION_JAR, LOTION_MAKEUP, LOTION_USE, STORAGE_BODYCARE, SHIPPING],
  HARD_GOOD: [HARD_GOOD_MEASUREMENTS, HARD_GOOD_USES, SHIPPING],
  GENERAL: [HARD_GOOD_MEASUREMENTS, HARD_GOOD_USES, SHIPPING]
};

export function specGroupsFor(kind: ProductSpecKind): SpecGroup[] {
  return SPEC_GROUPS[kind] || SPEC_GROUPS.GENERAL;
}

export function specFieldsFor(kind: ProductSpecKind): SpecField[] {
  return specGroupsFor(kind).flatMap((group) => group.fields);
}

/** Every field any kind asks for, keyed once. Used to validate a stored blob. */
const ALL_FIELDS = new Map<string, SpecField>(
  Object.values(SPEC_GROUPS)
    .flat()
    .flatMap((group) => group.fields)
    .map((field) => [field.key, field])
);

/** The form input name a field is posted under. Namespaced so nothing collides
 *  with `name`, `sku` or any other column-backed field on the same form. */
export function specInputName(key: string) {
  return `spec_${key}`;
}

function cleanValue(field: SpecField | undefined, value: unknown) {
  const max = field?.long ? SPEC_LONG_VALUE_MAX : SPEC_VALUE_MAX;
  return (
    String(value ?? '')
      // Collapse the runs of blank lines a paste leaves behind, but keep the
      // single newlines an ingredient list or a dormancy note is written with.
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim()
      .slice(0, max)
  );
}

/**
 * Whatever is in the JSON column, validated down to the fields the registry
 * knows about. Anything else — a hand-edited key, a field removed from the
 * registry in a later release — is dropped rather than rendered, so the
 * specification table can only ever show labelled, expected rows.
 */
export function readProductSpecs(value: unknown): Record<string, string> {
  if (typeof value === 'string') {
    try {
      return readProductSpecs(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const specs: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const field = ALL_FIELDS.get(key);
    if (!field) continue;
    if (raw != null && typeof raw === 'object') continue;
    const cleaned = cleanValue(field, raw);
    if (!cleaned) continue;
    specs[key] = cleaned;
    if (Object.keys(specs).length >= SPEC_KEY_LIMIT) break;
  }
  return specs;
}

export function specValue(specs: Record<string, string>, key: string) {
  return specs[key] || '';
}

/**
 * The specs to save: what was posted for the fields this kind actually asks
 * for, laid over what the product already had.
 *
 * Laid over rather than replacing, because the kind is decided by the category
 * and a category can be changed. Re-shelving a lotion as "Apothecary" and back
 * should not silently erase its ingredient list, and moving a plant to the
 * wrong category by mistake should be undoable by moving it back. Only the
 * fields on screen are rewritten — including to empty, which deletes them, so
 * clearing a box still clears the value.
 */
export function mergeProductSpecs(
  existing: unknown,
  posted: Record<string, string>,
  kind: ProductSpecKind
): Record<string, string> {
  const specs = readProductSpecs(existing);
  for (const field of specFieldsFor(kind)) {
    const value = cleanValue(field, posted[field.key]);
    if (value) specs[field.key] = value;
    else delete specs[field.key];
  }
  return specs;
}

/** Reads the posted spec values for one kind straight off a submitted form. */
export function productSpecsFromForm(
  form: { get(name: string): FormDataEntryValue | null },
  kind: ProductSpecKind
): Record<string, string> {
  const posted: Record<string, string> = {};
  for (const field of specFieldsFor(kind)) {
    posted[field.key] = String(form.get(specInputName(field.key)) ?? '');
  }
  return posted;
}

export type SpecRow = { key: string; label: string; value: string; long: boolean };
export type SpecSection = { title: string; rows: SpecRow[] };

/**
 * The specification table for a product page: the kind's own groups, with every
 * empty field and every group that emptied out removed. A product with nothing
 * filled in renders no table at all rather than a grid of dashes.
 */
export function specSections(kind: ProductSpecKind, value: unknown): SpecSection[] {
  const specs = readProductSpecs(value);
  return specGroupsFor(kind)
    .map((group) => ({
      title: group.title,
      rows: group.fields
        .filter((field) => specs[field.key])
        .map((field) => ({
          key: field.key,
          label: field.label,
          value: specs[field.key],
          long: Boolean(field.long)
        }))
    }))
    .filter((section) => section.rows.length > 0);
}

/** How many of a kind's fields are filled in, for the owner's "finish this" nudge. */
export function specCompleteness(kind: ProductSpecKind, value: unknown) {
  const specs = readProductSpecs(value);
  const fields = specFieldsFor(kind);
  return { filled: fields.filter((field) => specs[field.key]).length, total: fields.length };
}
