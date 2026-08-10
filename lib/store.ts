export const FALLBACK_PRODUCT_IMAGE =
  '/images/catalog/house-plants.webp';

export const CANONICAL_SITE_URL = 'https://thehillsidegardens.com';

/**
 * Photo ids that were seeded into the database historically and have since been
 * deleted upstream, mapped to the local image that replaces them. Existing rows
 * still hold these values — the deploy seed deliberately preserves owner data
 * rather than overwriting it — so they are resolved at read time.
 */
const LEGACY_IMAGE_REPLACEMENTS: Array<[string, string]> = [
  ['photo-1614594575810-51b862c2d7b6', '/images/catalog/house-plants.webp'],
  ['photo-1593691509543-c55fb32e5cee', '/images/catalog/house-plants.webp'],
  ['photo-1593482892290-f54927ae2bb0', '/images/catalog/live-plant-planters.webp'],
  ['photo-1509423350716-97f2360af8e4', '/images/scenes/potting-bench.webp'],
  ['photo-1485955900006-10f4d324d411', '/images/catalog/house-plants.webp'],
  ['photo-1497250681960-ef046c08a56e', '/images/catalog/live-plant-planters.webp'],
  ['photo-1416879595882-3373a0480b5b', '/images/scenes/potting-bench.webp'],
  ['photo-1466692476868-aef1dfb1e735', '/images/scenes/hillside-hero.webp']
];

/**
 * Resolves a stored image value to something safe to render or advertise.
 * Rendering already went through this via ResilientImage, but metadata and
 * JSON-LD did not, so shared links and rich results were still advertising
 * deleted photos.
 */
export function resolveImageUrl(source?: string | null) {
  const trimmed = source?.trim();
  if (!trimmed) return FALLBACK_PRODUCT_IMAGE;

  const replacement = LEGACY_IMAGE_REPLACEMENTS.find(([legacyId]) => trimmed.includes(legacyId));
  return replacement?.[1] || trimmed;
}

export function normalizeHillsideDomain(value: string) {
  return value.replaceAll('thehillsidegarden.com', 'thehillsidegardens.com');
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(cents / 100);
}

export function productTypeLabel(type: string) {
  const labels: Record<string, string> = {
    PLANT: 'Plant',
    TEA: 'Tea',
    TEA_SUPPLY: 'Tea supply',
    LOTION: 'Lotion',
    SOAP: 'Soap',
    OTHER: 'Botanical good'
  };
  return labels[type] || type.replaceAll('_', ' ').toLowerCase();
}

export function clampQuantity(value: number, inventory: number) {
  return Math.max(1, Math.min(Math.max(1, inventory), Math.floor(value || 1)));
}

export function absoluteUrl(path = '/') {
  const base = normalizeHillsideDomain(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
  return new URL(path, base).toString();
}
