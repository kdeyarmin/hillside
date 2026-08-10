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

/** Category photography, one image per collection, under public/images/catalog/. */
const catalogArtwork: Record<HillsideCatalogImage, BrandArtwork> = {
  'house-plants': {
    src: '/images/catalog/house-plants.webp',
    alt: 'Potted green house plants in white ceramic pots lined up on a pale sideboard'
  },
  'carnivorous-plants': {
    src: '/images/catalog/carnivorous-plants.webp',
    alt: 'A venus flytrap in a pale pot, traps open and rimmed with red'
  },
  'live-plant-planters': {
    src: '/images/catalog/live-plant-planters.webp',
    alt: 'Potted plants arranged along wooden shelving beside a window'
  },
  'homemade-soaps': {
    src: '/images/catalog/homemade-soaps.webp',
    alt: 'Handmade soap bars lined up on a wooden board with dried lavender'
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
          <img src="/logo-badge.png" alt="" width={949} height={768} loading="lazy" decoding="async" />
        </span>
      )}
    </div>
  );
}
