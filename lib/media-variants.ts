/**
 * Filenames for owner-uploaded photographs, and the responsive ladder hidden in
 * them.
 *
 * The site's own artwork gets responsive variants generated at build time and
 * listed in `lib/image-variants.ts`. Uploads cannot work that way — they arrive
 * from Tammy's phone at request time — so a photo she uploaded was served at one
 * size to every device, which for a 4032px camera roll original is the single
 * heaviest thing on the page.
 *
 * Rather than a table of which widths exist, the *name* carries them:
 *
 *   9f3c…-a21b-v400-800-1600.webp    the master, 1600px, with 400 and 800 beside it
 *   9f3c…-a21b-400w.webp             those two
 *   9f3c…-a21b-800w.webp
 *
 * Stateless, so nothing can drift out of step with the files on the volume, and
 * an unmarked name — every photo uploaded before this existed — simply has no
 * ladder and is served exactly as it was.
 */

/** The widths generated beside an upload, when the original is bigger. */
export const MEDIA_VARIANT_WIDTHS = [400, 800, 1200];

/** The longest edge an upload is stored at. Beyond this is invisible detail. */
export const MEDIA_MAX_WIDTH = 1600;

/** Bounds on a width read off a filename or posted by the browser. */
const MIN_WIDTH = 16;
const MAX_WIDTH = 8000;

export type MediaExtension = 'jpg' | 'png' | 'webp' | 'gif' | 'avif';

/**
 * A UUID stem, optionally followed by either the width marker or a variant's own
 * width. Anchored and digits-only after the stem, so nothing here can name a
 * path outside the upload directory.
 */
const MEDIA_FILENAME =
  /^([0-9a-f-]{36})(?:-v(\d{2,4}(?:-\d{2,4}){0,5})|-(\d{2,4})w)?\.(jpg|png|webp|gif|avif)$/;

export function parseMediaFilename(filename: string) {
  const match = MEDIA_FILENAME.exec(filename);
  if (!match) return null;
  const [, stem, marker, variantWidth, extension] = match;
  return {
    stem,
    extension: extension as MediaExtension,
    /** Every width available for this image, ascending. Empty when unmarked. */
    widths: marker ? marker.split('-').map(Number) : [],
    /** Set when this filename *is* one of the variants rather than the master. */
    variantWidth: variantWidth ? Number(variantWidth) : null
  };
}

export function isValidMediaFilename(filename: string) {
  return MEDIA_FILENAME.test(filename);
}

export function clampWidth(value: unknown) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return null;
  if (number < MIN_WIDTH || number > MAX_WIDTH) return null;
  return number;
}

/**
 * The widths to generate beside an original of this size: the fixed ladder,
 * minus anything that would be an upscale of the master. A 500px logo gets a
 * 400px variant and nothing else.
 */
export function variantWidthsFor(masterWidth: number) {
  return MEDIA_VARIANT_WIDTHS.filter((width) => width < masterWidth);
}

/** `<stem>-v400-800-1600.webp`, or a bare `<stem>.webp` when there is no ladder. */
export function masterFilename(stem: string, extension: MediaExtension, widths: number[]) {
  if (widths.length < 2) return `${stem}.${extension}`;
  return `${stem}-v${[...widths].sort((a, b) => a - b).join('-')}.${extension}`;
}

export function variantFilename(stem: string, extension: MediaExtension, width: number) {
  return `${stem}-${width}w.${extension}`;
}

/**
 * The `srcSet` for an uploaded photograph, or undefined when its name carries no
 * ladder. The widest entry is the master itself — the same shape the generated
 * site artwork uses, so `ResilientImage` needs no second code path.
 */
export function mediaSrcSet(path: string) {
  if (!path.startsWith('/media/')) return undefined;
  const parsed = parseMediaFilename(path.slice('/media/'.length));
  if (!parsed || parsed.widths.length < 2) return undefined;

  const master = Math.max(...parsed.widths);
  return parsed.widths
    .map((width) =>
      width === master
        ? `${path} ${width}w`
        : `/media/${variantFilename(parsed.stem, parsed.extension, width)} ${width}w`
    )
    .join(', ');
}
