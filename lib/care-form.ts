/**
 * Shared parsing for the care-library manager. Kept free of Next/Prisma so
 * `npm test` can cover the required-field rules without spinning up a server
 * action.
 */

export const CARE_GUIDE_TYPES = ['PLANT', 'GENERAL', 'PROBLEM', 'SEASONAL'] as const;
export type CareGuideTypeName = (typeof CARE_GUIDE_TYPES)[number];

export type CareGuideFields = {
  plantName: string;
  slug: string;
  guideType: CareGuideTypeName;
  category: string | null;
  difficulty: string | null;
  botanical: string | null;
  summary: string;
  light: string;
  water: string;
  humidity: string;
  soil: string;
  feeding: string;
  temperature: string;
  petSafety: string | null;
  tips: string;
  symptoms: string | null;
  causes: string | null;
  treatment: string | null;
  prevention: string | null;
  checklist: string | null;
  imageUrl: string | null;
  productId: string | null;
  featured: boolean;
  sortOrder: number;
  published: boolean;
};

export type ParsedCareGuide =
  | { ok: true; id: string; data: CareGuideFields }
  | { ok: false; reason: 'required'; id: string; slug: string };

function text(form: FormData, name: string) {
  return String(form.get(name) || '').trim();
}

function checked(form: FormData, name: string) {
  return form.get(name) === 'on' || form.get(name) === 'true';
}

function integer(form: FormData, name: string, fallback = 0) {
  const value = Number(form.get(name));
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

export function slugifyCare(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function parseGuideType(value: string): CareGuideTypeName {
  return CARE_GUIDE_TYPES.includes(value as CareGuideTypeName)
    ? (value as CareGuideTypeName)
    : 'PLANT';
}

export function adminCarePath(query: Record<string, string | undefined | null> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const encoded = params.toString();
  return encoded ? `/admin/care?${encoded}` : '/admin/care';
}

/**
 * One parser for create and update. Empty diagnostic fields become `null`
 * rather than being omitted, so clearing a box on the full editor is what
 * unpublishes that section.
 */
export function parseCareGuideInput(form: FormData): ParsedCareGuide {
  const id = text(form, 'id');
  const plantName = text(form, 'plantName');
  const slug = slugifyCare(text(form, 'slug')) || slugifyCare(plantName);
  const data: CareGuideFields = {
    plantName,
    slug,
    guideType: parseGuideType(text(form, 'guideType')),
    category: text(form, 'category') || null,
    difficulty: text(form, 'difficulty') || null,
    botanical: text(form, 'botanical') || null,
    summary: text(form, 'summary'),
    light: text(form, 'light'),
    water: text(form, 'water'),
    humidity: text(form, 'humidity'),
    soil: text(form, 'soil'),
    feeding: text(form, 'feeding'),
    temperature: text(form, 'temperature'),
    petSafety: text(form, 'petSafety') || null,
    tips: text(form, 'tips'),
    symptoms: text(form, 'symptoms') || null,
    causes: text(form, 'causes') || null,
    treatment: text(form, 'treatment') || null,
    prevention: text(form, 'prevention') || null,
    checklist: text(form, 'checklist') || null,
    imageUrl: text(form, 'imageUrl') || null,
    productId: text(form, 'productId') || null,
    featured: checked(form, 'featured'),
    sortOrder: integer(form, 'sortOrder'),
    published: checked(form, 'published')
  };

  if (!plantName || !slug || !data.summary || !data.tips) {
    return { ok: false, reason: 'required', id, slug };
  }
  return { ok: true, id, data };
}
