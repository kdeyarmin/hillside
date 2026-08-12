import { IMAGE_VARIANTS } from '@/lib/image-variants';

/**
 * Builds the `srcSet` for a site image from the variants generated beside it.
 *
 * Returns undefined for anything with no variants — owner-uploaded photographs
 * served from `/media/`, remote URLs, and the SVG placeholder. Those keep a plain
 * single `src`, which is what they had before, so nothing regresses when Tammy
 * uploads a photo from the dashboard.
 */
export function imageSrcSet(source?: string | null) {
  const path = source?.trim();
  if (!path || !path.startsWith('/images/')) return undefined;

  const widths = IMAGE_VARIANTS[path];
  if (!widths?.length) return undefined;

  const base = path.replace(/\.webp$/, '');
  const master = Math.max(...widths);

  return widths
    .map((width) => (width === master ? `${path} ${width}w` : `${base}-${width}w.webp ${width}w`))
    .join(', ');
}

/**
 * The `sizes` values the layout actually produces, named by role rather than
 * measured per call site so they stay in step with the CSS.
 *
 * `sizes` is not decoration: without it the browser assumes an image occupies the
 * full viewport width and picks the largest candidate, which would leave the
 * srcset doing nothing on exactly the narrow screens it exists for.
 */
export const IMAGE_SIZES = {
  /** Full-bleed hero, roughly half the page on wide screens. */
  hero: '(max-width: 900px) 100vw, 55vw',
  /** Product and care cards: two up on a phone, three or four in a desktop grid. */
  card: '(max-width: 600px) 45vw, (max-width: 1100px) 33vw, 300px',
  /** Collection tiles and gallery items, which run wider than a product card. */
  tile: '(max-width: 700px) 100vw, (max-width: 1200px) 45vw, 400px',
  /** The main product photograph and care-guide hero. */
  detail: '(max-width: 900px) 100vw, 50vw',
  /** Cart-drawer and cart-page thumbnails. */
  thumb: '80px'
} as const;

export type ImageSizeRole = keyof typeof IMAGE_SIZES;
