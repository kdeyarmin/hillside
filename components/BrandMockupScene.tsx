'use client';

import ResilientImage from '@/components/ResilientImage';
import {
  HILLSIDE_CATALOG_SPRITE_DATA_URI,
  HILLSIDE_CATALOG_VIEWBOXES,
  type HillsideCatalogImage
} from '@/components/generated-hillside-sprite';

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

export type { HillsideCatalogImage };

type BrandMockupSceneProps = {
  variant: BrandMockupVariant;
  className?: string;
  backgroundSrc?: string | null;
  alt?: string;
  catalogImage?: HillsideCatalogImage;
};

const defaultCatalogImage: Record<BrandMockupVariant, HillsideCatalogImage> = {
  hero: 'house-plants',
  plants: 'house-plants',
  tea: 'apothecary',
  botanicals: 'homemade-soaps',
  about: 'live-plant-planters',
  class: 'live-plant-planters',
  care: 'terrarium-supplies',
  shipping: 'moss',
  gifts: 'apothecary',
  picks: 'air-plants'
};

const catalogAlt: Record<HillsideCatalogImage, string> = {
  'house-plants': 'House plants styled with The Hillside Gardens branded plant tags',
  'carnivorous-plants': 'Carnivorous plants including pitcher plants, sundews and Venus flytraps with Hillside Gardens branding',
  'live-plant-planters': 'Finished live plant planters arranged in warm natural light with Hillside Gardens tags',
  'homemade-soaps': 'Handmade botanical soaps displayed in The Hillside Gardens branded packaging',
  moss: 'Preserved and decorative moss products arranged with The Hillside Gardens packaging',
  succulents: 'A curated collection of succulents in neutral planters with Hillside Gardens branding',
  driftwood: 'Natural driftwood and botanical display materials styled for The Hillside Gardens',
  apothecary: 'Hillside Gardens apothecary goods, herbal blends, jars and botanical products',
  'air-plants': 'Air plants displayed on driftwood and in decorative holders with Hillside Gardens branding',
  'terrarium-supplies': 'Terrarium supplies, moss, soil, stones and a planted glass terrarium from The Hillside Gardens'
};

function isOwnerProvidedPhoto(source?: string | null) {
  if (!source?.trim()) return false;

  const normalized = source.toLowerCase();
  return !(
    normalized.includes('images.unsplash.com') ||
    normalized.includes('source.unsplash.com') ||
    normalized.includes('/images/botanical-placeholder') ||
    normalized.includes('botanical-placeholder.svg') ||
    normalized.includes('/images/brand/')
  );
}

export default function BrandMockupScene({
  variant,
  className = '',
  backgroundSrc,
  alt,
  catalogImage
}: BrandMockupSceneProps) {
  const ownerProvided = isOwnerProvidedPhoto(backgroundSrc);
  const selectedCatalogImage = catalogImage || defaultCatalogImage[variant];

  return (
    <div
      className={`brand-mockup-scene brand-mockup-${variant} ${className}`.trim()}
      role="img"
      aria-label={alt || catalogAlt[selectedCatalogImage]}
    >
      {ownerProvided ? (
        <ResilientImage
          className="brand-mockup-background"
          src={backgroundSrc!}
          fallbackSrc="/images/botanical-placeholder.svg"
          alt=""
          aria-hidden="true"
          width={1600}
          height={1200}
          loading={variant === 'hero' ? 'eager' : 'lazy'}
          fetchPriority={variant === 'hero' ? 'high' : 'auto'}
          decoding="async"
        />
      ) : (
        <svg
          className="brand-mockup-background brand-generated-photo"
          viewBox={HILLSIDE_CATALOG_VIEWBOXES[selectedCatalogImage]}
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          focusable="false"
        >
          <image
            href={HILLSIDE_CATALOG_SPRITE_DATA_URI}
            x="0"
            y="0"
            width="2000"
            height="600"
            preserveAspectRatio="none"
          />
        </svg>
      )}
      <span className="brand-mockup-wash" aria-hidden="true" />
    </div>
  );
}
