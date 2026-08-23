import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { detectImageType, saveUploadedImage, validMediaFilename } from '../lib/uploads.ts';

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

describe('saveUploadedImage', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const gif = Buffer.from('GIF89a....');
  const asFile = (bytes: Buffer, name: string) => new File([new Uint8Array(bytes)], name);

  let directory = '';
  let previous: string | undefined;

  before(async () => {
    previous = process.env.UPLOAD_DIR;
    directory = await mkdtemp(path.join(tmpdir(), 'hillside-uploads-'));
    process.env.UPLOAD_DIR = directory;
  });

  after(async () => {
    if (previous === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  });

  it('writes the ladder and names the widths it wrote', async () => {
    const url = await saveUploadedImage(asFile(png, 'bench.png'), {
      width: 1600,
      variants: [
        { width: 400, file: asFile(png, 'bench-400w.png') },
        { width: 800, file: asFile(png, 'bench-800w.png') }
      ]
    });
    assert.match(url, /^\/media\/[0-9a-f-]{36}-v400-800-1600\.png$/);
    const written = (await readdir(directory)).filter((name) => name.endsWith('.png'));
    assert.equal(written.length, 3);
    assert.equal(written.filter((name) => /-400w\.png$/.test(name)).length, 1);
    assert.equal(written.filter((name) => /-800w\.png$/.test(name)).length, 1);
  });

  it("drops the whole ladder when a variant is not the master's format", async () => {
    /**
     * Variants are written under the master's extension, so GIF bytes would have
     * been stored as `.png` and served as `image/png` — an undecodable candidate
     * in a srcset the master's own name advertises. The photograph still stores,
     * at one size, with an unmarked name that promises no variants.
     */
    const url = await saveUploadedImage(asFile(png, 'bench.png'), {
      width: 1600,
      variants: [{ width: 400, file: asFile(gif, 'bench-400w.gif') }]
    });
    assert.match(url, /^\/media\/[0-9a-f-]{36}\.png$/);
  });

  it('ignores a "variant" that is not smaller than the master', async () => {
    const url = await saveUploadedImage(asFile(png, 'bench.png'), {
      width: 800,
      variants: [{ width: 1600, file: asFile(png, 'bench-1600w.png') }]
    });
    assert.match(url, /^\/media\/[0-9a-f-]{36}\.png$/);
  });
});
