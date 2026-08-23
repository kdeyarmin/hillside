import crypto from 'crypto';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import {
  clampWidth,
  isValidMediaFilename,
  masterFilename,
  variantFilename,
  type MediaExtension
} from './media-variants.ts';

/**
 * AVIF is here because phones have started producing it, not because we ask for
 * it: a photo taken on a recent Android and picked out of the gallery arrives as
 * AVIF, and rejecting it read to Tammy as "the upload is broken".
 */
const allowedTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif'
} as const satisfies Record<string, MediaExtension>;

export type AllowedImageType = keyof typeof allowedTypes;

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadValidationError';
  }
}

/**
 * Where owner-uploaded photographs live.
 *
 * The default is inside the container's working directory, which on Railway is
 * ephemeral — it is replaced on every deploy. Product rows keep pointing at
 * `/media/<uuid>`, so the database stayed consistent while the files underneath
 * it silently vanished, and every photo Tammy had uploaded 404'd after the next
 * deploy with nothing to explain why.
 *
 * In production that is a data-loss default, so it is refused rather than
 * honoured: `UPLOAD_DIR` must name a mounted volume (see `.env.example`). The
 * working-directory fallback remains for local development, where losing the
 * folder costs nothing.
 */
export function uploadDirectory() {
  const configured = process.env.UPLOAD_DIR?.trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'UPLOAD_DIR is not set. Uploaded images would be written to the container filesystem ' +
        'and lost on the next deploy. Mount a Railway Volume and set UPLOAD_DIR to its path.'
    );
  }

  return path.join(process.cwd(), '.data', 'uploads');
}

export function validMediaFilename(filename: string) {
  return isValidMediaFilename(filename);
}

export function mediaPath(filename: string) {
  if (!validMediaFilename(filename)) return null;
  return path.join(uploadDirectory(), filename);
}

export function mediaContentType(filename: string) {
  if (filename.endsWith('.jpg')) return 'image/jpeg';
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.webp')) return 'image/webp';
  if (filename.endsWith('.gif')) return 'image/gif';
  if (filename.endsWith('.avif')) return 'image/avif';
  return 'application/octet-stream';
}

function hasValidSignature(bytes: Buffer, type: AllowedImageType) {
  if (type === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (type === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (type === 'image/gif') {
    const signature = bytes.subarray(0, 6).toString('ascii');
    return signature === 'GIF87a' || signature === 'GIF89a';
  }
  if (type === 'image/avif') {
    /**
     * ISO base media format: a length, then `ftyp`, then the brand. Both the
     * still (`avif`) and the sequence (`avis`) brand are accepted — a browser
     * that decodes one decodes the other, and refusing a file for its brand
     * would look like the upload failing at random.
     */
    if (bytes.length < 12 || bytes.subarray(4, 8).toString('ascii') !== 'ftyp') return false;
    const brand = bytes.subarray(8, 12).toString('ascii');
    return brand === 'avif' || brand === 'avis';
  }
  return false;
}

/**
 * Trust the file bytes, not `file.type`. A mismatched Content-Type used to pick
 * the wrong extension and skip the matching magic-byte check; a JPEG labelled
 * as PNG would be stored as `.png` and served as `image/png`.
 */
export function detectImageType(bytes: Buffer): AllowedImageType | null {
  const types = Object.keys(allowedTypes) as AllowedImageType[];
  return types.find((type) => hasValidSignature(bytes, type)) || null;
}

function uploadMaxBytes() {
  return Math.max(1, Number(process.env.UPLOAD_MAX_BYTES || 8 * 1024 * 1024));
}

/** Reads one uploaded part, refusing anything that is not really an image. */
async function readImage(file: File) {
  const maxBytes = uploadMaxBytes();
  if (file.size <= 0) throw new UploadValidationError('The selected file is empty.');
  if (file.size > maxBytes) {
    throw new UploadValidationError(
      `The image is too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)} MB.`
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) {
    throw new UploadValidationError('Use a JPEG, PNG, WebP, AVIF or GIF image.');
  }
  return { bytes, type };
}

/** A smaller copy of the same photograph, prepared by the browser. */
export type UploadVariant = { width: number; file: File };

/**
 * Stores an uploaded photograph, along with any smaller copies the browser sent
 * with it, and returns the URL to save on the product.
 *
 * The variants are written *before* the master, and a failure among them drops
 * the whole ladder rather than failing the upload: the master's name is what
 * advertises which variants exist, so a marked name beside a missing file would
 * be a broken `srcset` on a live product page. One photograph at one size is a
 * far better outcome than that.
 */
export async function saveUploadedImage(
  file: File,
  { width, variants = [] }: { width?: number | null; variants?: UploadVariant[] } = {}
) {
  const { bytes, type } = await readImage(file);
  const extension = allowedTypes[type];
  const stem = crypto.randomUUID();
  const directory = uploadDirectory();
  await mkdir(directory, { recursive: true });

  const masterWidth = clampWidth(width);
  let widths: number[] = [];

  if (masterWidth && variants.length) {
    try {
      const written: number[] = [];
      for (const variant of variants) {
        const variantWidth = clampWidth(variant.width);
        // A "variant" at or above the master is not a variant, and letting one
        // through would put a wider candidate in the srcset than the file behind
        // it actually is.
        if (!variantWidth || variantWidth >= masterWidth) continue;
        const { bytes: variantBytes, type: variantType } = await readImage(variant.file);
        /**
         * A variant is written under the *master's* extension, so its bytes have
         * to actually be that format. Trusting the master's extension for
         * whatever arrived under `variant-<width>` would store, say, WebP bytes
         * as `.avif` — served with the wrong content type, undecodable, and sat
         * in a `srcset` the master's own name advertises. Dropping the ladder
         * (below) is the right answer rather than skipping the one file: a
         * request whose parts disagree about their format is malformed, and the
         * photograph is still stored at full size.
         */
        if (variantType !== type) {
          throw new Error(`Variant ${variantWidth}w is ${variantType}, not ${type}`);
        }
        await writeFile(
          path.join(directory, variantFilename(stem, extension, variantWidth)),
          variantBytes,
          { flag: 'wx', mode: 0o644 }
        );
        written.push(variantWidth);
      }
      if (written.length) widths = [...written, masterWidth].sort((a, b) => a - b);
    } catch (error) {
      console.error('Upload variants could not be written; storing one size only', error);
      widths = [];
    }
  }

  const filename = masterFilename(stem, extension, widths);
  await writeFile(path.join(directory, filename), bytes, { flag: 'wx', mode: 0o644 });
  return `/media/${filename}`;
}
