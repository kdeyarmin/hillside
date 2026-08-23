/**
 * Product photography, as a set of named slots rather than a pile of URLs.
 *
 * The shop shipped with stock artwork standing in for photographs nobody had
 * taken yet: a product with no picture of its own falls back to shared catalog
 * scenes, which is why three plants could show the same image. That was the
 * right call for an empty shop and the wrong one for a shop with inventory in
 * it, so every generic image is now something the dashboard names out loud.
 *
 * The slots are named because each answers a different question a shopper asks
 * — what does it look like in a room, what does the leaf detail look like, how
 * big is it, what turns up in the box — and the customer gallery labels them.
 * Anything with nothing particular to say goes in `galleryImages`.
 */

import { FALLBACK_PRODUCT_IMAGE } from './store.ts';

export type PhotoSlotKey =
  'imageUrl' | 'lifestyleImageUrl' | 'detailImageUrl' | 'scaleImageUrl' | 'packagingImageUrl';

export type PhotoSlot = {
  key: PhotoSlotKey;
  /** What the field is called in the dashboard. */
  label: string;
  /** What the customer gallery calls this view. */
  caption: string;
  hint: string;
  /** Whether a listing is incomplete without it. Only the main photo is. */
  required: boolean;
};

export const PHOTO_SLOTS: PhotoSlot[] = [
  {
    key: 'imageUrl',
    label: 'Main photograph',
    caption: 'Main',
    hint: 'The one that carries the card and the search result. Plain background, whole item.',
    required: true
  },
  {
    key: 'lifestyleImageUrl',
    label: 'Lifestyle photograph',
    caption: 'In a home',
    hint: 'On a shelf, a windowsill, a kitchen counter — where it will actually live.',
    required: false
  },
  {
    key: 'detailImageUrl',
    label: 'Detail photograph',
    caption: 'Detail',
    hint: 'Close in on the leaf, the grain, the label — whatever is worth seeing up close.',
    required: false
  },
  {
    key: 'scaleImageUrl',
    label: 'Scale photograph',
    caption: 'Size',
    hint: 'Beside a hand, a mug or a tape measure, so nobody is surprised by the box.',
    required: false
  },
  {
    key: 'packagingImageUrl',
    label: 'Packaging photograph',
    caption: 'Packaging',
    hint: 'How it is wrapped, boxed or labelled when it arrives.',
    required: false
  }
];

export type PhotoStatus = 'missing' | 'generic' | 'own';

/**
 * Stand-in artwork the shop ships with, plus the placeholders anything falls
 * back to when an image fails to load. Kept in one place because three separate
 * copies of this list had already drifted apart: the dashboard's "needs a photo"
 * chip and the customer-facing branded visual disagreed about whether a legacy
 * Unsplash URL counted.
 */
function isGenericArtwork(source: string) {
  return (
    source.includes('/images/catalog/') ||
    source.includes('/images/scenes/') ||
    source.includes('/images/botanical-placeholder') ||
    source.includes('images.unsplash.com') ||
    source === FALLBACK_PRODUCT_IMAGE
  );
}

export function photoStatus(source: string | null | undefined): PhotoStatus {
  const trimmed = source?.trim();
  if (!trimmed) return 'missing';
  return isGenericArtwork(trimmed) ? 'generic' : 'own';
}

/** True when what a customer sees is not a photograph of this product. */
export function needsRealPhoto(source: string | null | undefined) {
  return photoStatus(source) !== 'own';
}

export type PhotoBearing = Partial<Record<PhotoSlotKey, string | null>> & {
  galleryImages?: string[] | null;
};

/** The slots that hold a real photograph, in the order the gallery shows them. */
export function filledPhotoSlots(product: PhotoBearing) {
  return PHOTO_SLOTS.filter((slot) => photoStatus(product[slot.key]) === 'own');
}

export type ProductPhoto = { src: string; caption: string };

/**
 * Every photograph a product page can show, named and de-duplicated.
 *
 * A generic main image is still returned — the page has to render something, and
 * `BrandedProductVisual` is what makes stand-in artwork look deliberate — but it
 * never brings a thumbnail strip with it, because a one-photo gallery of stock
 * artwork is just a picture with extra chrome.
 */
export function productPhotos(product: PhotoBearing): ProductPhoto[] {
  const photos: ProductPhoto[] = [];
  const seen = new Set<string>();

  const add = (source: string | null | undefined, caption: string) => {
    const trimmed = source?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    photos.push({ src: trimmed, caption });
  };

  for (const slot of PHOTO_SLOTS) add(product[slot.key], slot.caption);
  const extras = product.galleryImages || [];
  extras.forEach((source, index) => add(source, `View ${index + 2}`));

  return photos;
}

/**
 * How many real photographs a product has. The dashboard leads with this, since
 * "1 photo" and "5 photos" are the difference between a listing that sells and
 * one that gets a "do you have another picture?" email.
 */
export function realPhotoCount(product: PhotoBearing) {
  return productPhotos(product).filter((photo) => photoStatus(photo.src) === 'own').length;
}
