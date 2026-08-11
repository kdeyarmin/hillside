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
 * The spec itself lives in `scripts/lib/photo.mjs`, shared with
 * `generate-image.mjs` so both produce identically graded files.
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
 *   --dir      catalog (default) | scenes | gallery | assets
 *   --focus    "x,y" as fractions 0–1 naming the point to keep centred.
 *              Default 0.5,0.5. Use this when the subject is off-centre; the
 *              storefront crops hard and the spec's safe area is the middle.
 *   --grade    Grade strength 0–1, default 1. 0 exports the straight photograph.
 *   --max-kb   Size budget, default 400. Quality steps down until it fits.
 *   --force    Overwrite an existing file.
 *   --measure  Print the statistics of a directory of images and exit.
 *   --allow-upscale  Accept a source below 1600×1200. Rare, and worth recording.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  DIRECTORIES,
  HEIGHT,
  WIDTH,
  describe,
  parseArgs,
  readSource,
  renderToSpec
} from './lib/photo.mjs';

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

  const bytes = await readSource(source);
  const { buffer, quality, upscaled } = await renderToSpec(bytes, {
    focus: typeof args.focus === 'string' ? args.focus : undefined,
    grade: args.grade === undefined ? 1 : args.grade,
    budgetKb: args['max-kb'] ?? 400,
    allowUpscale: Boolean(args['allow-upscale'])
  });

  await mkdir(directory, { recursive: true });
  await writeFile(outFile, buffer);

  const result = await describe(outFile);
  console.log(`Wrote ${outFile}`);
  console.log(
    `  ${result.width}x${result.height}  q${quality}  ${result.kb.toFixed(0)} kb  ` +
      `warmth ${result.warmth.toFixed(1)}  saturation ${result.saturation.toFixed(3)}  ` +
      `brightness ${result.brightnessPct.toFixed(1)}%${upscaled ? '  (upscaled)' : ''}`
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
