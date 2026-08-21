import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectImageType } from '../lib/uploads.ts';

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

  it('ignores the claimed MIME type of a non-image', () => {
    assert.equal(detectImageType(Buffer.from('not an image')), null);
    assert.equal(detectImageType(Buffer.from([])), null);
  });
});
