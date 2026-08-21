import crypto from 'crypto';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';

const allowedTypes = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
} as const;

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
  return /^[0-9a-f-]{36}\.(?:jpg|png|webp|gif)$/.test(filename);
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

export async function saveUploadedImage(file: File) {
  const maxBytes = Math.max(1, Number(process.env.UPLOAD_MAX_BYTES || 8 * 1024 * 1024));
  if (file.size <= 0) throw new UploadValidationError('The selected file is empty.');
  if (file.size > maxBytes) {
    throw new UploadValidationError(
      `The image is too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)} MB.`
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) {
    throw new UploadValidationError('Use a JPEG, PNG, WebP or GIF image.');
  }

  const filename = `${crypto.randomUUID()}${allowedTypes[type]}`;
  const directory = uploadDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), bytes, { flag: 'wx', mode: 0o644 });
  return `/media/${filename}`;
}
