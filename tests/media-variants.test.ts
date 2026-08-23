import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isValidMediaFilename,
  masterFilename,
  mediaSrcSet,
  parseMediaFilename,
  variantFilename,
  variantWidthsFor
} from '../lib/media-variants.ts';

const STEM = '9f3c1a2b-4d5e-4f60-8a71-b2c3d4e5f607';

describe('media filenames', () => {
  it('refuses anything that could name a file outside the upload directory', () => {
    assert.equal(isValidMediaFilename(`${STEM}.webp`), true);
    assert.equal(isValidMediaFilename(`${STEM}-v400-800-1600.webp`), true);
    assert.equal(isValidMediaFilename(`${STEM}-800w.webp`), true);
    assert.equal(isValidMediaFilename('../../etc/passwd'), false);
    assert.equal(isValidMediaFilename(`${STEM}/../secret.webp`), false);
    assert.equal(isValidMediaFilename(`${STEM}.txt`), false);
    assert.equal(isValidMediaFilename(`${STEM}-v400-800-1600.exe`), false);
  });

  it('accepts what phones now produce', () => {
    assert.equal(isValidMediaFilename(`${STEM}.avif`), true);
  });

  it('carries the ladder in the name, and nothing when there is no ladder', () => {
    assert.equal(masterFilename(STEM, 'webp', [400, 800, 1600]), `${STEM}-v400-800-1600.webp`);
    assert.equal(masterFilename(STEM, 'webp', []), `${STEM}.webp`);
    // One width is not a ladder — there is nothing for a browser to choose.
    assert.equal(masterFilename(STEM, 'webp', [1600]), `${STEM}.webp`);
    assert.equal(variantFilename(STEM, 'webp', 800), `${STEM}-800w.webp`);
  });

  it('reads a name back', () => {
    assert.deepEqual(parseMediaFilename(`${STEM}-v400-800-1600.webp`), {
      stem: STEM,
      extension: 'webp',
      widths: [400, 800, 1600],
      variantWidth: null
    });
    assert.deepEqual(parseMediaFilename(`${STEM}.jpg`), {
      stem: STEM,
      extension: 'jpg',
      widths: [],
      variantWidth: null
    });
    assert.equal(parseMediaFilename('nope.webp'), null);
  });
});

describe('variantWidthsFor', () => {
  it('never asks for a variant wider than the original', () => {
    assert.deepEqual(variantWidthsFor(1600), [400, 800, 1200]);
    assert.deepEqual(variantWidthsFor(900), [400, 800]);
    assert.deepEqual(variantWidthsFor(320), []);
  });
});

describe('mediaSrcSet', () => {
  it('names the master last and the variants beside it', () => {
    assert.equal(
      mediaSrcSet(`/media/${STEM}-v400-800-1600.webp`),
      `/media/${STEM}-400w.webp 400w, /media/${STEM}-800w.webp 800w, /media/${STEM}-v400-800-1600.webp 1600w`
    );
  });

  it('leaves an unmarked upload exactly as it was', () => {
    // Every photo uploaded before the browser started resizing them.
    assert.equal(mediaSrcSet(`/media/${STEM}.jpg`), undefined);
    assert.equal(mediaSrcSet('/images/catalog/house-plants.webp'), undefined);
  });
});
