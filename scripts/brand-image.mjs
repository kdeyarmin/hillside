#!/usr/bin/env node
/**
 * Turns a source photograph into a Hillside brand asset.
 *
 * docs/image-credits.md describes this process — "cropped to 4:3 at 1600×1200
 * around a per-image focal point, put through one shared colour grade so the set
 * reads as a single shoot, and exported as WebP" — but it was only ever done by
 * hand, so nobody could reproduce it or add a fourteenth image that matched. This
 * is that process, written down.
 *
 * Usage:
 *   node scripts/brand-image.mjs --in shot.jpg --out tea
 *   node scripts/brand-image.mjs --in shot.jpg --out tea --dir catalog --focus 0.5,0.42
 *   node scripts/brand-image.mjs --in https://example.com/photo.jpg --out tea
 *   node scripts/brand-image.mjs --measure public/images/catalog
 *
 * Options:
 *   --in       Source image: a local path or an https URL. Required.
 *   --out      Output basename without extension, e.g. "tea". Required.
 *   --dir      catalog (default) | scenes | gallery
 *   --focus    "x,y" as fractions 0–1 naming the point to keep centred.
 *              Default 0.5,0.5. Use this when the subject is off-centre; the
 *              storefront crops hard and the spec's safe area is the middle.
 *   --grade    Grade strength 0–1, default 1. 0 exports the straight photograph.
 *   --max-kb   Size budget, default 400. Quality steps down until it fits.
 *   --force    Overwrite an existing file.
 *   --measure  Print the statistics of a directory of images and exit.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);

/** The spec: 4:3 at 1600×1200, never upscaled from a smaller source. */
const WIDTH = 1600;
const HEIGHT = 1200;

/**
 * The shared grade, measured from the thirteen images already in the set rather
 * than invented: mean RGB 143.0/141.8/121.2, so a consistent warm bias of about
 * +22 red over blue, and mean saturation 0.134 — muted, not punchy. These values
 * reproduce that look on a straight photograph without flattening one that
 * already has it.
 */
const GRADE = {
  saturation: 0.94,
  brightness: 1.01,
  // Per-channel gain and offset. Warms the highlights, cools nothing, and lifts
  // the black point slightly so the images sit together on a cream page.
  gain: [1.025, 1.0, 0.965],
  offset: [1.5, 0.5, -1.5]
};

const DIRECTORIES = {
  catalog: 'public/images/catalog',
  scenes: 'public/images/scenes',
  gallery: 'public/images/gallery'
};

function parseArgs(argv) {
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

async function describe(file) {
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

async function measure(directory) {
  const { readdir } = await import('node:fs/promises');
  const names = (await readdir(directory)).filter((name) => /\.(webp|jpe?g|png)$/i.test(name));
  if (!names.length) {
    console.log(`No images in ${directory}`);
    return;
  }

  const rows = [];
  for (const name of names) rows.push(await describe(path.join(directory, name)));

  console.log(
    ['image'.padEnd(30), 'size'.padEnd(11), 'warmth'.padStart(7), 'sat'.padStart(7), 'bright'.padStart(7), 'kb'.padStart(6)].join(' ')
  );
  for (const row of rows) {
    console.log(
      [
        path.basename(row.file).padEnd(30),
        `${row.width}x${row.height}`.padEnd(11),
        row.warmth.toFixed(1).padStart(7),
        row.saturation.toFixed(3).padStart(7),
        `${row.brightnessPct.toFixed(1)}%`.padStart(7),
        row.kb.toFixed(0).padStart(6)
      ].join(' ')
    );
  }

  const mean = (pick) => rows.reduce((total, row) => total + pick(row), 0) / rows.length;
  console.log(
    `\nset average  warmth ${mean((r) => r.warmth).toFixed(1)}  ` +
      `saturation ${mean((r) => r.saturation).toFixed(3)}  ` +
      `brightness ${mean((r) => r.brightnessPct).toFixed(1)}%  ` +
      `${mean((r) => r.kb).toFixed(0)} kb`
  );
  const offSpec = rows.filter((row) => row.width !== WIDTH || row.height !== HEIGHT);
  if (offSpec.length) {
    console.log(`\noff-spec dimensions: ${offSpec.map((r) => path.basename(r.file)).join(', ')}`);
  }
}

/** Downloads through curl so the agent proxy and its CA bundle are honoured. */
async function readSource(source) {
  if (!/^https?:\/\//i.test(source)) return readFile(source);

  const temp = path.join('/tmp', `brand-source-${Date.now()}`);
  await run('curl', ['-sSL', '--max-time', '120', '--fail', '-o', temp, source]);
  const bytes = await readFile(temp);
  return bytes;
}

/** Below this the artefacts show, so it is a floor rather than a starting point. */
const MIN_QUALITY = 50;
const START_QUALITY = 82;

/**
 * Encodes WebP, stepping quality down until the file fits the budget, and fails
 * if it never does.
 *
 * The budget is a promise the docs make — every image in the set is committed to
 * the repo — so quietly writing an oversized file is the one outcome that must
 * not happen. Returns the quality actually used, which is not the same as the
 * loop counter after the loop ends.
 */
async function encodeWithinBudget(pipeline, budgetKb) {
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
function cropBox(width, height, focusX, focusY) {
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

async function build(args) {
  const source = args.in;
  const name = args.out;
  if (!source || typeof source !== 'string') throw new Error('--in is required');
  if (!name || typeof name !== 'string') throw new Error('--out is required');

  const dirKey = typeof args.dir === 'string' ? args.dir : 'catalog';
  const directory = DIRECTORIES[dirKey];
  if (!directory) throw new Error(`--dir must be one of ${Object.keys(DIRECTORIES).join(', ')}`);

  const outFile = path.join(directory, `${path.basename(name, path.extname(name))}.webp`);
  if (existsSync(outFile) && !args.force) {
    throw new Error(`${outFile} already exists. Pass --force to replace it.`);
  }

  const [focusX, focusY] = (typeof args.focus === 'string' ? args.focus : '0.5,0.5')
    .split(',')
    .map((value) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error('--focus takes two fractions between 0 and 1, e.g. 0.5,0.4');
      }
      return parsed;
    });

  const bytes = await readSource(source);
  const meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height) throw new Error('Could not read the source image.');
  if (meta.width < WIDTH || meta.height < HEIGHT) {
    // The spec is explicit: downscaled, never upscaled. An upscaled photograph
    // beside twelve native ones is exactly the mismatch the grid exposes.
    throw new Error(
      `Source is ${meta.width}x${meta.height}; the brand spec needs at least ${WIDTH}x${HEIGHT}.`
    );
  }

  const strength = args.grade === undefined ? 1 : Number(args.grade);
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new Error('--grade takes a number between 0 and 1');
  }
  const mix = (value, neutral) => neutral + (value - neutral) * strength;

  const box = cropBox(meta.width, meta.height, focusX, focusY);
  const pipeline = sharp(bytes)
    .rotate() // honour EXIF orientation before cropping, or the box is wrong
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

  const budgetKb = Number(args['max-kb'] ?? 400);
  const { buffer: output, quality } = await encodeWithinBudget(pipeline, budgetKb);

  await mkdir(directory, { recursive: true });
  await writeFile(outFile, output);

  const result = await describe(outFile);
  console.log(`Wrote ${outFile}`);
  console.log(
    `  ${result.width}x${result.height}  q${quality}  ${result.kb.toFixed(0)} kb  ` +
      `warmth ${result.warmth.toFixed(1)}  saturation ${result.saturation.toFixed(3)}  ` +
      `brightness ${result.brightnessPct.toFixed(1)}%`
  );
  console.log(
    '  set targets: warmth ~21.8, saturation ~0.134, brightness ~52.6%, under 400 kb.\n' +
      '  Record the source and its licence in docs/image-credits.md.'
  );
}

const args = parseArgs(process.argv.slice(2));
try {
  if (args.measure) {
    await measure(typeof args.measure === 'string' ? args.measure : 'public/images/catalog');
  } else {
    await build(args);
  }
} catch (error) {
  // A stack trace here is noise: every failure this script raises is something
  // the person running it has to fix in the arguments or the source photograph.
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}
