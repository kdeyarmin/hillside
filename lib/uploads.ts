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

export function uploadDirectory() {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), '.data', 'uploads');
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

export async function saveUploadedImage(file: File) {
  const type = file.type as AllowedImageType;
  const extension = allowedTypes[type];
  if (!extension) {
    throw new Error('Use a JPEG, PNG, WebP or GIF image.');
  }

  const maxBytes = Math.max(1, Number(process.env.UPLOAD_MAX_BYTES || 8 * 1024 * 1024));
  if (file.size <= 0) throw new Error('The selected file is empty.');
  if (file.size > maxBytes) {
    throw new Error(`The image is too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!hasValidSignature(bytes, type)) {
    throw new Error('The selected file does not appear to be a valid image.');
  }

  const filename = `${crypto.randomUUID()}${extension}`;
  const directory = uploadDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), bytes, { flag: 'wx', mode: 0o644 });
  return `/media/${filename}`;
}
