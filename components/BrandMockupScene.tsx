'use client';

import ResilientImage from '@/components/ResilientImage';
import type { ImageSizeRole } from '@/lib/image-srcset';
import { pickForKey } from '@/lib/store';

export type BrandMockupVariant =
  | 'hero'
  | 'plants'
  | 'tea'
  | 'botanicals'
  | 'about'
  | 'class'
  | 'care'
  | 'shipping'
  | 'gifts'
  | 'picks';

export type HillsideCatalogImage =
  | 'house-plants'
  | 'carnivorous-plants'
  | 'live-plant-planters'
  | 'homemade-soaps'
  | 'moss'
  | 'succulents'
  | 'driftwood'
  | 'apothecary'
  | 'air-plants'
  | 'terrarium-supplies';

type BrandMockupSceneProps = {
  variant: BrandMockupVariant;
  className?: string;
  /**
   * Which layout slot this scene fills, deciding its `sizes`. It cannot be
   * inferred from `variant`: the same `plants` variant backs both a full-width
   * collection tile and a product card two-up in a phone grid, and defaulting
   * everything to the tile's `100vw` had cards downloading the 1200w variant
   * when about 500px was enough.
   */
  sizeRole?: ImageSizeRole;
  backgroundSrc?: string | null;
  alt?: string;
  catalogImage?: HillsideCatalogImage;
  /**
   * A source that is definitely the intended artwork — a collection cover, say —
   * rather than a product row that may still hold a seeded placeholder. Skips the
   * `isOwnerProvidedPhoto` heuristic entirely.
   */
  imageSrc?: string | null;
  /**
   * A stable value — a class id, say — used to spread repeated placements across
   * the alternates for their variant. Without it, a page listing three classes
   * that have no photograph yet showed the same workshop scene three times.
   */
  seed?: string;
  /**
   * Overlays the Hillside mark. Off by default: repeated on every tile it read as
   * stock-photo watermarking and competed with the header logo. Reserved for the
   * hero and the occasional storytelling scene.
   */
  badge?: boolean;
};

type BrandArtwork = { src: string; alt: string };

/** Category photography, one image per collection, under public/images/catalog/. */
const catalogArtwork: Record<HillsideCatalogImage, BrandArtwork> = {
  'house-plants': {
    src: '/images/catalog/house-plants.webp',
    alt: 'Potted green house plants in pale ceramic pots lined up along a light wood sideboard'
  },
  'carnivorous-plants': {
    src: '/images/catalog/carnivorous-plants.webp',
    alt: 'A Venus flytrap in a white ceramic bowl of dark peat, its traps open'
  },
  'live-plant-planters': {
    src: '/images/catalog/live-plant-planters.webp',
    alt: 'Potted plants in terracotta and stoneware arranged along two wooden shelves'
  },
  'homemade-soaps': {
    src: '/images/catalog/homemade-soaps.webp',
    alt: 'Handmade soap bars in kraft paper bands stacked on a wooden board with dried lavender'
  },
  moss: {
    src: '/images/catalog/moss.webp',
    alt: 'Green moss growing in soft cushions across a stone surface'
  },
  succulents: {
    src: '/images/catalog/succulents.webp',
    alt: 'Small succulents in terracotta pots arranged on a white surface'
  },
  driftwood: {
    src: '/images/catalog/driftwood.webp',
    alt: 'Weathered driftwood branches stacked together, grain bleached pale'
  },
  apothecary: {
    src: '/images/catalog/apothecary.webp',
    alt: 'Two amber glass apothecary bottles resting on natural linen'
  },
  'air-plants': {
    src: '/images/catalog/air-plants.webp',
    alt: 'A tillandsia air plant inside a hanging glass globe'
  },
  'terrarium-supplies': {
    src: '/images/catalog/terrarium-supplies.webp',
    alt: 'Succulents planted inside a clear glass terrarium'
  }
};

/**
 * Artwork chosen by placement. The wide storytelling surfaces get their own scenes;
 * the merchandising variants fall back to the matching category photograph.
 */
const variantArtwork: Record<BrandMockupVariant, BrandArtwork> = {
  hero: {
    src: '/images/scenes/hillside-hero.webp',
    alt: 'Sunlight through a timber-framed greenhouse filled with growing plants'
  },
  about: {
    src: '/images/scenes/potting-bench.webp',
    alt: 'Terracotta pots, garden twine and seedlings on a potting bench'
  },
  class: {
    src: '/images/scenes/workshop-table.webp',
    alt: 'A glass terrarium being planted with moss and greenery on a wooden table'
  },
  care: catalogArtwork['terrarium-supplies'],
  shipping: catalogArtwork.moss,
  plants: catalogArtwork['house-plants'],
  tea: catalogArtwork.apothecary,
  botanicals: catalogArtwork['homemade-soaps'],
  gifts: catalogArtwork.apothecary,
  picks: catalogArtwork['air-plants']
};

/**
 * Alternates for the variants that get placed several times on one page. Only
 * scenes that genuinely depict the same activity are listed, so a class card can
 * never advertise something the class is not.
 */
const variantAlternates: Partial<Record<BrandMockupVariant, BrandArtwork[]>> = {
  class: [
    variantArtwork.class,
    catalogArtwork['live-plant-planters'],
    catalogArtwork['terrarium-supplies'],
    catalogArtwork['house-plants']
  ],
  /* The gift hub tiles every guide at once, and one apothecary shelf repeated
     five times reads as a page that could not be bothered. */
  gifts: [
    catalogArtwork.apothecary,
    catalogArtwork['live-plant-planters'],
    catalogArtwork['homemade-soaps'],
    catalogArtwork['house-plants'],
    catalogArtwork.succulents
  ]
};

function isOwnerProvidedPhoto(source?: string | null) {
  if (!source?.trim()) return false;

  const normalized = source.toLowerCase();
  return !(
    normalized.includes('images.unsplash.com') ||
    normalized.includes('source.unsplash.com') ||
    normalized.includes('/images/botanical-placeholder') ||
    normalized.includes('botanical-placeholder.svg') ||
    normalized.includes('/images/brand/') ||
    normalized.includes('/images/scenes/') ||
    normalized.includes('/images/catalog/')
  );
}

export default function BrandMockupScene({
  variant,
  className = '',
  sizeRole,
  backgroundSrc,
  alt,
  catalogImage,
  imageSrc,
  seed,
  badge = false
}: BrandMockupSceneProps) {
  const alternates = seed ? variantAlternates[variant] : undefined;
  const artwork = catalogImage
    ? catalogArtwork[catalogImage]
    : alternates
      ? pickForKey(alternates, seed as string)
      : variantArtwork[variant];
  const ownerProvided = isOwnerProvidedPhoto(backgroundSrc);
  const resolvedSrc = imageSrc?.trim() || (ownerProvided ? backgroundSrc! : artwork.src);
  const imageAlt = alt || artwork.alt;

  return (
    <div
      className={`brand-mockup-scene brand-mockup-${variant} ${className}`.trim()}
      role="img"
      aria-label={imageAlt}
    >
      <ResilientImage
        className="brand-mockup-background"
        sizeRole={sizeRole ?? (variant === 'hero' ? 'hero' : 'tile')}
        src={resolvedSrc}
        fallbackSrc="/images/botanical-placeholder.svg"
        alt=""
        aria-hidden="true"
        width={1200}
        height={900}
        loading={variant === 'hero' ? 'eager' : 'lazy'}
        fetchPriority={variant === 'hero' ? 'high' : 'auto'}
        decoding="async"
      />
      <span className="brand-mockup-wash" aria-hidden="true" />
      {badge && (
        <span className="brand-photo-badge" aria-hidden="true">
          <img
            src="/logo-badge.webp"
            alt=""
            width={480}
            height={388}
            loading="lazy"
            decoding="async"
          />
        </span>
      )}
    </div>
  );
}
