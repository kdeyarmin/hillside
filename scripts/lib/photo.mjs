/**
 * The brand's photograph spec, and the one implementation of it.
 *
 * Extracted from `brand-image.mjs` when `generate-image.mjs` arrived and needed
 * the same crop, the same grade and the same size budget. Two copies of a colour
 * grade is how a set stops matching, so there is one.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);

/** The spec: 4:3 at 1600x1200, never upscaled from a smaller source. */
export const WIDTH = 1600;
export const HEIGHT = 1200;

/**
 * The shared grade, measured from the thirteen images already in the set rather
 * than invented: mean RGB 143.0/141.8/121.2, so a consistent warm bias of about
 * +22 red over blue, and mean saturation 0.134 — muted, not punchy. These values
 * reproduce that look on a straight photograph without flattening one that
 * already has it.
 */
export const GRADE = {
  saturation: 0.94,
  brightness: 1.01,
  // Per-channel gain and offset. Warms the highlights, cools nothing, and lifts
  // the black point slightly so the images sit together on a cream page.
  gain: [1.025, 1.0, 0.965],
  offset: [1.5, 0.5, -1.5]
};

export const DIRECTORIES = {
  catalog: 'public/images/catalog',
  scenes: 'public/images/scenes',
  gallery: 'public/images/gallery',
  // Unbranded originals, outside public/ so they are never served. The mockup
  // step reads from here, which is what makes it idempotent.
  assets: 'assets/photography'
};

/** Below this the artefacts show, so it is a floor rather than a starting point. */
export const MIN_QUALITY = 50;
export const START_QUALITY = 82;

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function lightnessAndSaturation(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const saturation =
    max === min
      ? 0
      : lightness < 127.5
        ? (max - min) / (max + min)
        : (max - min) / (510 - max - min);
  return { lightness, saturation };
}

export async function describe(file) {
  const image = sharp(file);
  const [meta, stats, fileStat] = await Promise.all([image.metadata(), image.stats(), stat(file)]);
  const [r, g, b] = stats.channels.slice(0, 3).map((channel) => channel.mean);
  const { lightness, saturation } = lightnessAndSaturation(r, g, b);
  return {
    file,
    width: meta.width,
    height: meta.height,
    meanRgb: [r, g, b],
    warmth: r - b,
    saturation,
    brightnessPct: lightness / 2.55,
    kb: fileStat.size / 1024
  };
}

/** Downloads through curl so the agent proxy and its CA bundle are honoured. */
export async function readSource(source) {
  if (!/^https?:\/\//i.test(source)) return readFile(source);

  const temp = path.join('/tmp', `brand-source-${Date.now()}`);
  await run('curl', ['-sSL', '--max-time', '120', '--fail', '-o', temp, source]);
  return readFile(temp);
}

/**
 * Encodes WebP, stepping quality down until the file fits the budget, and fails
 * if it never does.
 *
 * The budget is a promise the docs make — every image in the set is committed to
 * the repo — so quietly writing an oversized file is the one outcome that must
 * not happen. Returns the quality actually used, which is not the same as the
 * loop counter after the loop ends.
 */
export async function encodeWithinBudget(pipeline, budgetKb) {
  let quality = START_QUALITY;
  let buffer = await pipeline.clone().webp({ quality, effort: 6 }).toBuffer();

  while (buffer.length / 1024 > budgetKb && quality > MIN_QUALITY) {
    quality = Math.max(MIN_QUALITY, quality - 6);
    buffer = await pipeline.clone().webp({ quality, effort: 6 }).toBuffer();
  }

  if (buffer.length / 1024 > budgetKb) {
    throw new Error(
      `Cannot fit this image under ${budgetKb} kb: it is ${(buffer.length / 1024).toFixed(0)} kb ` +
        `even at quality ${MIN_QUALITY}. Crop tighter, choose a less detailed frame, or raise the ` +
        `budget with --max-kb.`
    );
  }

  return { buffer, quality };
}

/**
 * Crops to 4:3 around the focal point. `sharp`'s own cover-fit always crops to
 * the centre (or an entropy guess), which is no use when the subject sits off to
 * one side and the storefront then crops the result again.
 */
export function cropBox(width, height, focusX, focusY) {
  const targetRatio = WIDTH / HEIGHT;
  let cropWidth = width;
  let cropHeight = Math.round(width / targetRatio);
  if (cropHeight > height) {
    cropHeight = height;
    cropWidth = Math.round(height * targetRatio);
  }

  const left = Math.round(Math.min(Math.max(focusX * width - cropWidth / 2, 0), width - cropWidth));
  const top = Math.round(Math.min(Math.max(focusY * height - cropHeight / 2, 0), height - cropHeight));
  return { left, top, width: cropWidth, height: cropHeight };
}

export function parseFocus(value) {
  return (typeof value === 'string' ? value : '0.5,0.5').split(',').map((entry) => {
    const parsed = Number(entry);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new Error('--focus takes two fractions between 0 and 1, e.g. 0.5,0.4');
    }
    return parsed;
  });
}

/**
 * Bytes in, a finished brand asset out: oriented, cropped to 4:3, graded, and
 * encoded inside the size budget.
 *
 * `allowUpscale` exists for one reason and should stay rare. The spec is
 * explicit that images are downscaled and never upscaled — an upscaled
 * photograph beside twelve native ones is exactly the mismatch a grid exposes —
 * but some image generators top out below 1600x1200, and refusing their output
 * outright would be the wrong trade when the alternative is no image at all. The
 * caller has to ask for it, and the caller is expected to say so in the credits.
 */
export async function renderToSpec(bytes, { focus, grade = 1, budgetKb = 400, allowUpscale = false } = {}) {
  const [focusX, focusY] = Array.isArray(focus) ? focus : parseFocus(focus);

  // Bake in EXIF orientation before anything measures the image. A phone held
  // sideways writes a 1200x1600 frame with an orientation flag that displays it
  // as 1600x1200 — so metadata() reported portrait, the crop was computed in
  // that coordinate system, and a perfectly good 1600x1200 photograph was
  // rejected for being too small. Everything below now works in display space.
  const oriented = await sharp(bytes).rotate().toBuffer();
  const meta = await sharp(oriented).metadata();
  if (!meta.width || !meta.height) throw new Error('Could not read the source image.');

  const upscaled = meta.width < WIDTH || meta.height < HEIGHT;
  if (upscaled && !allowUpscale) {
    throw new Error(
      `Source is ${meta.width}x${meta.height}; the brand spec needs at least ${WIDTH}x${HEIGHT}. ` +
        `Pass --allow-upscale to accept a softer image, and record that it was upscaled.`
    );
  }

  const strength = Number(grade);
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new Error('--grade takes a number between 0 and 1');
  }
  const mix = (value, neutral) => neutral + (value - neutral) * strength;

  const box = cropBox(meta.width, meta.height, focusX, focusY);
  const pipeline = sharp(oriented)
    .extract(box)
    .resize(WIDTH, HEIGHT, { fit: 'fill', kernel: 'lanczos3' })
    .modulate({
      saturation: mix(GRADE.saturation, 1),
      brightness: mix(GRADE.brightness, 1)
    })
    .linear(
      GRADE.gain.map((value) => mix(value, 1)),
      GRADE.offset.map((value) => mix(value, 0))
    );

  const { buffer, quality } = await encodeWithinBudget(pipeline, Number(budgetKb));
  return { buffer, quality, sourceWidth: meta.width, sourceHeight: meta.height, upscaled };
}
