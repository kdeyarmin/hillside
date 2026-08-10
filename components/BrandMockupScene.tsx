'use client';

import ResilientImage from '@/components/ResilientImage';

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
  backgroundSrc?: string | null;
  alt?: string;
  catalogImage?: HillsideCatalogImage;
  /** Overlays the Hillside mark on the image. Off for the small product tiles. */
  badge?: boolean;
};

type BrandArtwork = { src: string; alt: string };

/** Category artwork, one illustration per collection, under public/images/catalog/. */
const catalogArtwork: Record<HillsideCatalogImage, BrandArtwork> = {
  'house-plants': {
    src: '/images/catalog/house-plants.svg',
    alt: 'Illustration of leafy house plants, a trailing pothos and a snake plant in pots'
  },
  'carnivorous-plants': {
    src: '/images/catalog/carnivorous-plants.svg',
    alt: 'Illustration of venus flytraps, sarracenia trumpets and hanging pitcher plants'
  },
  'live-plant-planters': {
    src: '/images/catalog/live-plant-planters.svg',
    alt: 'Illustration of a long stoneware trough planted with mixed greenery, blooms and trailing ivy'
  },
  'homemade-soaps': {
    src: '/images/catalog/homemade-soaps.svg',
    alt: 'Illustration of stacked botanical soap bars with a kraft label and dried lavender'
  },
  moss: {
    src: '/images/catalog/moss.svg',
    alt: 'Illustration of cushion moss mounds on a wooden tray beside a rolled sheet of moss'
  },
  succulents: {
    src: '/images/catalog/succulents.svg',
    alt: 'Illustration of succulent rosettes planted in a shallow stone bowl'
  },
  driftwood: {
    src: '/images/catalog/driftwood.svg',
    alt: 'Illustration of weathered driftwood branches on sand with moss and an air plant'
  },
  apothecary: {
    src: '/images/catalog/apothecary.svg',
    alt: 'Illustration of an amber dropper bottle, a corked stoneware jar and a bundle of dried herbs'
  },
  'air-plants': {
    src: '/images/catalog/air-plants.svg',
    alt: 'Illustration of tillandsia air plants in hanging glass globes and on driftwood'
  },
  'terrarium-supplies': {
    src: '/images/catalog/terrarium-supplies.svg',
    alt: 'Illustration of a layered glass terrarium beside planting tools and a sack of pebbles'
  }
};

/**
 * Artwork chosen by placement. The wide storytelling surfaces get their own scenes;
 * the merchandising variants fall back to the matching category illustration.
 */
const variantArtwork: Record<BrandMockupVariant, BrandArtwork> = {
  hero: {
    src: '/images/scenes/hillside-hero.svg',
    alt: 'Illustration of a sunlit greenhouse shelf of potted plants, a hanging plant and a watering can'
  },
  about: {
    src: '/images/scenes/potting-bench.svg',
    alt: 'Illustration of a potting bench with a plant being repotted, terracotta pots and hanging garden tools'
  },
  class: {
    src: '/images/scenes/workshop-table.svg',
    alt: 'Illustration of a workshop table set with terrariums in progress, planting tools and seedlings'
  },
  care: catalogArtwork['terrarium-supplies'],
  shipping: catalogArtwork.moss,
  plants: catalogArtwork['house-plants'],
  tea: catalogArtwork.apothecary,
  botanicals: catalogArtwork['homemade-soaps'],
  gifts: catalogArtwork.apothecary,
  picks: catalogArtwork['air-plants']
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
  backgroundSrc,
  alt,
  catalogImage,
  badge = true
}: BrandMockupSceneProps) {
  const artwork = catalogImage ? catalogArtwork[catalogImage] : variantArtwork[variant];
  const ownerProvided = isOwnerProvidedPhoto(backgroundSrc);
  const imageSrc = ownerProvided ? backgroundSrc! : artwork.src;
  const imageAlt = alt || artwork.alt;

  return (
    <div
      className={`brand-mockup-scene brand-mockup-${variant} ${className}`.trim()}
      role="img"
      aria-label={imageAlt}
    >
      <ResilientImage
        className="brand-mockup-background"
        src={imageSrc}
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
          <img src="/logo-mark.svg" alt="" width={132} height={114} loading="lazy" decoding="async" />
        </span>
      )}
    </div>
  );
}
