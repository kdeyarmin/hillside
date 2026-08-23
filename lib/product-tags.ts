/**
 * The shop's filterable attributes, in one place.
 *
 * Two kinds live here and the difference matters. *Assignable* tags are the ones
 * Tammy ticks on a product — pet safe, low light, handmade — and are stored in
 * `Product.tags`. *Derived* tags are worked out at render time from data the
 * shop already holds: in stock, on sale, ships, local pickup, new, best seller.
 * Deriving them is what stops the catalog from carrying two answers to the same
 * question, which is how a "Best seller" checkbox left ticked on a product that
 * stopped selling ends up lying to shoppers.
 *
 * Each tag also declares which product types it applies to, because a filter
 * rail that offers a soap customer a light-requirement filter is noise. Nothing
 * outside this file decides that; the admin form and the shop filters both read
 * `tagsForTypes`.
 */

/** The groups a filter rail is broken into, in the order they should appear. */
export const TAG_GROUPS = [
  { key: 'light', label: 'Light' },
  { key: 'care', label: 'Care' },
  { key: 'habit', label: 'Growth habit' },
  { key: 'size', label: 'Size' },
  { key: 'making', label: 'How it is made' },
  { key: 'buying', label: 'Getting it home' }
] as const;

export type TagGroupKey = (typeof TAG_GROUPS)[number]['key'];

export type ProductTag = {
  slug: string;
  label: string;
  group: TagGroupKey;
  /** One line of help under the checkbox in the dashboard. */
  hint?: string;
  /**
   * Product types this attribute is offered for. Omitted means every type — the
   * handmade and giftable tags belong on a tea tin as much as on a plant.
   */
  types?: readonly string[];
  /** Words a shopper might type that should find products carrying this tag. */
  synonyms?: readonly string[];
};

const PLANTS = ['PLANT'] as const;

/**
 * Assignable attributes. Slugs are the stored value and must not be renamed
 * without migrating `Product.tags`; labels are free to be reworded.
 */
export const PRODUCT_TAGS: readonly ProductTag[] = [
  {
    slug: 'beginner-friendly',
    label: 'Beginner friendly',
    group: 'care',
    types: PLANTS,
    hint: 'Forgiving of a missed watering and a first plant you can succeed with.',
    synonyms: [
      'beginner',
      'easy',
      'easy care',
      'starter',
      'first plant',
      'low maintenance',
      'hard to kill',
      'foolproof'
    ]
  },
  {
    slug: 'pet-safe',
    label: 'Pet safe',
    group: 'care',
    types: PLANTS,
    hint: 'Non-toxic to cats and dogs per the ASPCA listing.',
    synonyms: [
      'pet safe',
      'pet friendly',
      'cat safe',
      'dog safe',
      'non toxic',
      'nontoxic',
      'safe for cats',
      'safe for dogs'
    ]
  },
  {
    slug: 'drought-tolerant',
    label: 'Drought tolerant',
    group: 'care',
    types: PLANTS,
    hint: 'Happier dry than wet — good for a traveller or a forgetful waterer.',
    synonyms: ['drought', 'dry', 'forgiving', 'infrequent watering', 'forget to water', 'travel']
  },
  {
    slug: 'high-humidity',
    label: 'Likes humidity',
    group: 'care',
    types: PLANTS,
    hint: 'Wants a bathroom, a terrarium or a pebble tray.',
    synonyms: ['humidity', 'humid', 'bathroom', 'terrarium', 'misting', 'steamy']
  },
  {
    slug: 'low-light',
    label: 'Low light',
    group: 'light',
    types: PLANTS,
    hint: 'Copes with a north window, a hallway or an office.',
    synonyms: [
      'low light',
      'shade',
      'shady',
      'dark room',
      'north facing',
      'dim',
      'no window',
      'office'
    ]
  },
  {
    slug: 'bright-light',
    label: 'Bright light',
    group: 'light',
    types: PLANTS,
    hint: 'Wants a bright or sunny window to do well.',
    synonyms: [
      'bright light',
      'bright',
      'sunny',
      'full sun',
      'direct sun',
      'south facing',
      'sun loving'
    ]
  },
  {
    slug: 'trailing',
    label: 'Trailing',
    group: 'habit',
    types: PLANTS,
    hint: 'Spills over a shelf or hangs.',
    synonyms: ['trailing', 'hanging', 'vining', 'cascading', 'shelf', 'hanging basket']
  },
  {
    slug: 'climbing',
    label: 'Climbing',
    group: 'habit',
    types: PLANTS,
    hint: 'Wants a pole, a trellis or something to hold onto.',
    synonyms: ['climbing', 'climber', 'moss pole', 'trellis', 'vine', 'totem']
  },
  {
    slug: 'compact',
    label: 'Compact',
    group: 'size',
    types: PLANTS,
    hint: 'Desk, windowsill or bookshelf sized.',
    synonyms: ['compact', 'small', 'desk', 'tabletop', 'windowsill', 'mini', 'tiny', 'apartment']
  },
  {
    slug: 'large-plant',
    label: 'Large plant',
    group: 'size',
    types: PLANTS,
    hint: 'A floor plant that fills a corner.',
    synonyms: ['large', 'big', 'floor plant', 'statement', 'tall', 'corner']
  },
  {
    slug: 'rare',
    label: 'Rare or unusual',
    group: 'making',
    types: PLANTS,
    hint: 'Hard to find locally, or a collector piece.',
    synonyms: ['rare', 'unusual', 'collector', 'hard to find', 'uncommon', 'special']
  },
  {
    slug: 'handmade',
    label: 'Handmade',
    group: 'making',
    hint: 'Made by hand rather than bought in.',
    synonyms: ['handmade', 'hand made', 'handcrafted', 'made by hand', 'artisan']
  },
  {
    slug: 'small-batch',
    label: 'Small batch',
    group: 'making',
    hint: 'Made in limited quantities, so it comes and goes.',
    synonyms: ['small batch', 'limited', 'batch', 'limited run']
  },
  {
    slug: 'giftable',
    label: 'Giftable',
    group: 'making',
    hint: 'Ready to give, or easy to make into a gift.',
    synonyms: ['gift', 'giftable', 'present', 'gift set', 'housewarming', 'birthday']
  },
  {
    slug: 'seasonal',
    label: 'Seasonal',
    group: 'making',
    hint: 'Only around for part of the year. Set the season dates on the product to have this appear on its own.',
    synonyms: ['seasonal', 'holiday', 'christmas', 'spring', 'summer', 'fall', 'autumn', 'winter']
  }
] as const;

/**
 * Attributes the shop works out for itself. They are filterable and searchable
 * exactly like the assignable ones, but nothing writes them to a product — which
 * is the point: they cannot go stale.
 */
export const DERIVED_TAGS: readonly ProductTag[] = [
  {
    slug: 'in-stock',
    label: 'In stock',
    group: 'buying',
    synonyms: ['in stock', 'available', 'ready', 'ready to ship']
  },
  {
    slug: 'local-pickup',
    label: 'Local pickup',
    group: 'buying',
    synonyms: ['pickup', 'pick up', 'local', 'collect', 'ebensburg', 'curbside', 'in person']
  },
  {
    slug: 'ships',
    label: 'Ships',
    group: 'buying',
    synonyms: ['ships', 'shipping', 'delivered', 'mail', 'post']
  },
  {
    slug: 'new',
    label: 'New',
    group: 'buying',
    synonyms: ['new', 'new arrival', 'just in', 'latest', 'recent']
  },
  {
    slug: 'best-seller',
    label: 'Best seller',
    group: 'buying',
    synonyms: [
      'best seller',
      'bestseller',
      'best selling',
      'popular',
      'top seller',
      'favourite',
      'favorite'
    ]
  },
  {
    slug: 'staff-pick',
    label: 'Tammy’s pick',
    group: 'buying',
    synonyms: ['staff pick', 'tammy pick', 'tammys pick', 'owner pick', 'recommended']
  },
  {
    slug: 'on-sale',
    label: 'On sale',
    group: 'buying',
    synonyms: ['sale', 'on sale', 'discount', 'reduced', 'markdown', 'deal']
  }
] as const;

export const ALL_TAGS: readonly ProductTag[] = [...PRODUCT_TAGS, ...DERIVED_TAGS];

const BY_SLUG = new Map(ALL_TAGS.map((tag) => [tag.slug, tag]));

export function findTag(slug: string) {
  return BY_SLUG.get(slug) || null;
}

export function tagLabel(slug: string) {
  return BY_SLUG.get(slug)?.label || slug.replaceAll('-', ' ');
}

/** Only tags this file knows about, deduplicated and in catalog order. */
export function normalizeTags(values: readonly string[] | null | undefined): string[] {
  const wanted = new Set((values || []).map((value) => value.trim().toLowerCase()));
  return PRODUCT_TAGS.filter((tag) => wanted.has(tag.slug)).map((tag) => tag.slug);
}

function appliesToType(tag: ProductTag, type: string) {
  return !tag.types || tag.types.includes(type);
}

/**
 * The assignable attributes worth offering for a set of product types. A shop
 * showing only soaps has no light filter; a shop showing soaps *and* plants
 * keeps it, because some of what is on screen answers to it.
 */
export function tagsForTypes(types: readonly string[]): ProductTag[] {
  if (!types.length) return [...PRODUCT_TAGS];
  return PRODUCT_TAGS.filter((tag) => types.some((type) => appliesToType(tag, type)));
}

/** Grouped for rendering, with empty groups dropped. */
export function groupTags(tags: readonly ProductTag[]) {
  return TAG_GROUPS.map((group) => ({
    ...group,
    tags: tags.filter((tag) => tag.group === group.key)
  })).filter((group) => group.tags.length > 0);
}

export type DerivableProduct = {
  type?: string;
  inventory: number;
  ships?: boolean | null;
  pickup?: boolean | null;
  tags?: readonly string[] | null;
  staffPick?: boolean | null;
};

export type DerivedFlags = {
  isNew?: boolean;
  isBestSeller?: boolean;
  isOnSale?: boolean;
  isInSeason?: boolean;
};

/**
 * Every attribute a product can be filtered by: what Tammy ticked, plus what the
 * shop knows. `seasonal` is a union of the two on purpose — a product can be
 * marked seasonal by hand, or earn it from the season window on its record.
 */
export function tagsForProduct(product: DerivableProduct, flags: DerivedFlags = {}): string[] {
  const tags = new Set(normalizeTags(product.tags));

  if (product.inventory > 0) tags.add('in-stock');
  if (product.pickup) tags.add('local-pickup');
  if (product.ships) tags.add('ships');
  if (product.staffPick) tags.add('staff-pick');
  if (flags.isNew) tags.add('new');
  if (flags.isBestSeller) tags.add('best-seller');
  if (flags.isOnSale) tags.add('on-sale');
  if (flags.isInSeason) tags.add('seasonal');

  return Array.from(tags);
}

/**
 * Search text for one attribute set: the labels a shopper might read plus the
 * synonyms they might type. "pet safe" has to find a plant tagged `pet-safe`
 * even though those exact words appear nowhere in its description.
 */
export function tagSearchText(slugs: readonly string[]): string {
  return slugs
    .map((slug) => {
      const tag = BY_SLUG.get(slug);
      if (!tag) return slug.replaceAll('-', ' ');
      return [tag.label, slug.replaceAll('-', ' '), ...(tag.synonyms || [])].join(' ');
    })
    .join(' ');
}
