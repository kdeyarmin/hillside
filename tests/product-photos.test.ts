import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  needsRealPhoto,
  photoStatus,
  productPhotos,
  realPhotoCount
} from '../lib/product-photos.ts';

describe('photoStatus', () => {
  it('tells a real photograph from the artwork standing in for one', () => {
    assert.equal(photoStatus('/media/monstera.jpg'), 'own');
    assert.equal(photoStatus(null), 'missing');
    assert.equal(photoStatus('   '), 'missing');
    assert.equal(photoStatus('/images/catalog/house-plants.webp'), 'generic');
    assert.equal(photoStatus('/images/scenes/potting-bench.webp'), 'generic');
    assert.equal(photoStatus('/images/botanical-placeholder.svg'), 'generic');
    // Legacy seeded rows still hold these.
    assert.equal(photoStatus('https://images.unsplash.com/photo-123'), 'generic');
  });

  it('answers the dashboard question the same way either way', () => {
    assert.equal(needsRealPhoto('/media/monstera.jpg'), false);
    assert.equal(needsRealPhoto('/images/catalog/house-plants.webp'), true);
    assert.equal(needsRealPhoto(null), true);
  });
});

describe('productPhotos', () => {
  it('names each view, in the order the gallery shows them', () => {
    assert.deepEqual(
      productPhotos({
        imageUrl: '/media/main.webp',
        detailImageUrl: '/media/leaf.webp',
        lifestyleImageUrl: '/media/shelf.webp',
        galleryImages: ['/media/back.webp']
      }),
      [
        { src: '/media/main.webp', caption: 'Main' },
        { src: '/media/shelf.webp', caption: 'In a home' },
        { src: '/media/leaf.webp', caption: 'Detail' },
        { src: '/media/back.webp', caption: 'View 2' }
      ]
    );
  });

  it('shows one photograph once, whichever slots point at it', () => {
    const photos = productPhotos({
      imageUrl: '/media/main.webp',
      scaleImageUrl: '/media/main.webp',
      galleryImages: ['/media/main.webp', '  ', '/media/other.webp']
    });
    assert.deepEqual(
      photos.map((photo) => photo.src),
      ['/media/main.webp', '/media/other.webp']
    );
  });

  it('counts only what is actually a photograph of this product', () => {
    assert.equal(
      realPhotoCount({
        imageUrl: '/images/catalog/house-plants.webp',
        galleryImages: ['/media/back.webp']
      }),
      1
    );
  });
});
