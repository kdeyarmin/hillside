import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectImageType, validMediaFilename } from '../lib/uploads.ts';

/** `<size><ftyp><brand>`, the opening of any ISO base media file. */
const ftyp = (brand: string) =>
  Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from(brand), Buffer.alloc(8)]);

describe('detectImageType', () => {
  it('reads JPEG, PNG, WebP and GIF from magic bytes', () => {
    assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
    assert.equal(
      detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      'image/png'
    );
    assert.equal(
      detectImageType(
        Buffer.from(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]))
      ),
      'image/webp'
    );
    assert.equal(detectImageType(Buffer.from('GIF89a......')), 'image/gif');
  });

  it('accepts the AVIF that recent phones now hand over', () => {
    assert.equal(detectImageType(ftyp('avif')), 'image/avif');
    assert.equal(detectImageType(ftyp('avis')), 'image/avif');
    // Other ISO base media files share the container but are not images.
    assert.equal(detectImageType(ftyp('mp42')), null);
  });

  it('ignores the claimed MIME type of a non-image', () => {
    assert.equal(detectImageType(Buffer.from('not an image')), null);
    assert.equal(detectImageType(Buffer.from([])), null);
  });
});

describe('validMediaFilename', () => {
  const stem = '9f3c1a2b-4d5e-4f60-8a71-b2c3d4e5f607';

  it('still serves everything uploaded before responsive variants existed', () => {
    assert.equal(validMediaFilename(`${stem}.jpg`), true);
    assert.equal(validMediaFilename(`${stem}.webp`), true);
  });

  it('serves a marked master and its variants, and nothing else', () => {
    assert.equal(validMediaFilename(`${stem}-v400-800-1600.webp`), true);
    assert.equal(validMediaFilename(`${stem}-800w.webp`), true);
    assert.equal(validMediaFilename('../../etc/passwd'), false);
    assert.equal(validMediaFilename(`${stem}.svg`), false);
  });
});
