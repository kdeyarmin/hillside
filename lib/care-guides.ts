/**
 * The kinds of care guide the library publishes, and what each is called.
 *
 * One source of truth because these labels appear in five places — the library
 * filters, a guide's own header, the product page's care section, the admin
 * dropdown and the structured data — and they had drifted: the same guide was a
 * "Plant problem guide" on its own page, a "Common issue" in the dashboard and a
 * "Plant problem" in the library filter.
 *
 * Kept free of Prisma and Next so it can be imported from a client component and
 * covered by `npm test`. The strings match `CareGuideType` in the schema.
 */

export const CARE_GUIDE_TYPES = ['PLANT', 'BEGINNER', 'GENERAL', 'PROBLEM', 'SEASONAL'] as const;

export type CareGuideTypeName = (typeof CARE_GUIDE_TYPES)[number];

export function isCareGuideType(value: unknown): value is CareGuideTypeName {
  return CARE_GUIDE_TYPES.includes(value as CareGuideTypeName);
}

/** What one guide of this kind is called: "Plant profile", "Beginner guide". */
export function careGuideTypeLabel(type: string) {
  const labels: Record<string, string> = {
    PLANT: 'Plant profile',
    BEGINNER: 'Beginner guide',
    GENERAL: 'Plant care basics',
    PROBLEM: 'Common issue',
    SEASONAL: 'Seasonal care'
  };
  return labels[type] || 'Plant care';
}

/** The heading a shelf of them gets: "Plant profiles", "Beginner guides". */
export function careGuideTypePlural(type: string) {
  const plurals: Record<string, string> = {
    PLANT: 'Plant profiles',
    BEGINNER: 'Beginner guides',
    GENERAL: 'Care basics',
    PROBLEM: 'Common issues',
    SEASONAL: 'Seasonal care'
  };
  return plurals[type] || 'Plant care';
}

/** The fuller wording a guide's own header uses. */
export function careGuideTypeHeading(type: string) {
  const headings: Record<string, string> = {
    PLANT: 'Plant profile',
    BEGINNER: 'Start here — beginner guide',
    GENERAL: 'Plant care basics',
    PROBLEM: 'Plant problem guide',
    SEASONAL: 'Seasonal plant care'
  };
  return headings[type] || 'Plant care';
}

/**
 * What the admin dropdown offers, in the order it offers it. Written out rather
 * than derived so the wording can explain the choice — "Common issue / plant
 * problem" is clearer in a form than "Common issue" is.
 */
export const CARE_GUIDE_TYPE_OPTIONS: Array<{
  value: CareGuideTypeName;
  label: string;
  hint: string;
}> = [
  {
    value: 'PLANT',
    label: 'Plant profile',
    hint: 'One species: light, water, soil, feeding, pet safety.'
  },
  {
    value: 'BEGINNER',
    label: 'Beginner guide',
    hint: 'Someone’s first plant — "Beginner-friendly houseplants".'
  },
  {
    value: 'GENERAL',
    label: 'General education',
    hint: 'A skill or a shortlist — "Best houseplants for low light".'
  },
  {
    value: 'PROBLEM',
    label: 'Troubleshooting',
    hint: 'A symptom — "Why are my pothos leaves yellow?"'
  },
  {
    value: 'SEASONAL',
    label: 'Seasonal',
    hint: 'What to do this time of year — winter light, summer watering.'
  }
];
