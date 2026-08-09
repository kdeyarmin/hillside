'use client';

import BrandMockupScene, { type BrandMockupVariant } from '@/components/BrandMockupScene';
import ResilientImage from '@/components/ResilientImage';
import { FALLBACK_PRODUCT_IMAGE } from '@/lib/store';

type BrandedProductVisualProps = {
  slug: string;
  name: string;
  type: string;
  imageUrl?: string | null;
  className?: string;
  detail?: boolean;
  loading?: 'eager' | 'lazy';
};

function variantForType(type: string): BrandMockupVariant {
  if (type === 'PLANT') return 'plants';
  if (type === 'TEA' || type === 'TEA_SUPPLY') return 'tea';
  if (type === 'SOAP' || type === 'LOTION') return 'botanicals';
  return 'gifts';
}

function isStarterOrPlaceholderImage(imageUrl?: string | null) {
  if (!imageUrl) return true;
  return (
    imageUrl.includes('images.unsplash.com') ||
    imageUrl.includes('/images/botanical-placeholder') ||
    imageUrl === FALLBACK_PRODUCT_IMAGE
  );
}

export default function BrandedProductVisual({
  slug,
  name,
  type,
  imageUrl,
  className = '',
  detail = false,
  loading = 'lazy'
}: BrandedProductVisualProps) {
  if (isStarterOrPlaceholderImage(imageUrl)) {
    return (
      <BrandMockupScene
        variant={variantForType(type)}
        backgroundSrc={imageUrl || undefined}
        alt={`${name}, presented in The Hillside Gardens branded packaging`}
        className={`${detail ? 'branded-product-detail' : 'branded-product-card'} ${className}`.trim()}
      />
    );
  }

  return (
    <ResilientImage
      className={className}
      src={imageUrl}
      fallbackSrc="/images/botanical-placeholder.svg"
      alt={name}
      width={detail ? 1400 : 1200}
      height={detail ? 1400 : 1050}
      loading={loading}
      decoding="async"
      data-product-slug={slug}
    />
  );
}
