/**
 * Resizing and re-encoding a photograph in the browser, before it is uploaded.
 *
 * Tammy photographs the bench on her phone. A modern phone camera produces a
 * 12-megapixel, four-to-six megabyte file; the shop displays it at 1400px at the
 * very most. Uploading the original meant the 8 MB ceiling was a real limit she
 * hit, the upload took as long as the signal allowed, and every visitor to that
 * product page then downloaded a camera-roll original.
 *
 * Doing it here rather than on the server keeps `sharp` out of the deploy — the
 * same call the build-time photography pipeline makes — and has two side
 * benefits worth as much as the size: iOS hands over HEIC, which the server has
 * no way to read, and canvas decoding turns it into WebP on the way past; and
 * `imageOrientation: 'from-image'` bakes in the EXIF rotation, so a photo taken
 * sideways stops arriving sideways.
 *
 * Every step degrades to "upload the original file": an older browser, a decoder
 * that refuses the format, a canvas that will not encode. Uploading is the point
 * and must not be the thing that breaks.
 */

import { MEDIA_MAX_WIDTH, variantWidthsFor } from '@/lib/media-variants';

/**
 * Quality for the stored WebP. 0.82 is where a photograph of foliage stops
 * showing visible blocking around leaf edges; below it, moss goes to mush.
 */
const WEBP_QUALITY = 0.82;

/** Smaller copies can afford a little less, since they render smaller. */
const VARIANT_QUALITY = 0.78;

export type PreparedUpload = {
  /** What to send as `file`. The original when nothing could be improved. */
  file: File;
  /** The master's pixel width, or null when it could not be measured. */
  width: number | null;
  variants: Array<{ width: number; file: File }>;
  /** For the status line: how much smaller the upload got. */
  originalBytes: number;
  uploadedBytes: number;
};

function unchanged(file: File): PreparedUpload {
  return {
    file,
    width: null,
    variants: [],
    originalBytes: file.size,
    uploadedBytes: file.size
  };
}

async function decode(file: File) {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Some browsers reject the options bag rather than ignoring it.
    try {
      return await createImageBitmap(file);
    } catch {
      return null;
    }
  }
}

function canvasFor(width: number, height: number) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function encode(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  if ('convertToBlob' in canvas) {
    try {
      return await canvas.convertToBlob({ type: 'image/webp', quality });
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
  });
}

async function render(bitmap: ImageBitmap, width: number, quality: number) {
  const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width));
  const canvas = canvasFor(width, height);
  const context = canvas.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, width, height);

  const blob = await encode(canvas, quality);
  // A browser that cannot encode WebP hands back a PNG under the requested type,
  // which would be larger than the original it replaced.
  if (!blob || blob.type !== 'image/webp') return null;
  return blob;
}

/**
 * Resizes and re-encodes a chosen file, and prepares the smaller copies that go
 * up beside it.
 *
 * Animated GIFs are passed through untouched — drawing one to a canvas keeps the
 * first frame and silently throws away the animation, which is not a compression
 * decision anyone asked for.
 */
export async function prepareImageUpload(file: File): Promise<PreparedUpload> {
  if (file.type === 'image/gif') return unchanged(file);

  const bitmap = await decode(file);
  if (!bitmap || !bitmap.width || !bitmap.height) return unchanged(file);

  try {
    const masterWidth = Math.min(MEDIA_MAX_WIDTH, bitmap.width);
    const master = await render(bitmap, masterWidth, WEBP_QUALITY);
    if (!master) return unchanged(file);

    /**
     * A file that is already small and already WebP gains nothing from a second
     * pass, and re-encoding it again would only lose detail. Keeping the
     * original also keeps its variants out of the way: a 500px logo does not
     * need a ladder.
     */
    if (master.size >= file.size && masterWidth === bitmap.width) return unchanged(file);

    const stem = file.name.replace(/\.[^.]+$/, '') || 'photo';
    const variants: PreparedUpload['variants'] = [];
    for (const width of variantWidthsFor(masterWidth)) {
      const blob = await render(bitmap, width, VARIANT_QUALITY);
      if (!blob) continue;
      variants.push({
        width,
        file: new File([blob], `${stem}-${width}w.webp`, { type: 'image/webp' })
      });
    }

    return {
      file: new File([master], `${stem}.webp`, { type: 'image/webp' }),
      width: masterWidth,
      variants,
      originalBytes: file.size,
      uploadedBytes: master.size
    };
  } finally {
    bitmap.close?.();
  }
}

/** "4.2 MB" / "180 KB", for the line that tells her what the upload did. */
export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Uploads one chosen file, resizing it first. Shared by the product photo
 * manager and the plainer enhancer on the rest of the dashboard's forms, so both
 * behave identically about size, orientation and format.
 */
export async function uploadImageFile(file: File) {
  const prepared = await prepareImageUpload(file);
  const formData = new FormData();
  formData.append('file', prepared.file);
  if (prepared.width) formData.append('width', String(prepared.width));
  for (const variant of prepared.variants) {
    formData.append(`variant-${variant.width}`, variant.file);
  }

  const response = await fetch('/api/admin/upload', { method: 'POST', body: formData });
  const result = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !result.url) {
    throw new Error(result.error || 'The image could not be uploaded.');
  }
  return { url: result.url, prepared };
}
