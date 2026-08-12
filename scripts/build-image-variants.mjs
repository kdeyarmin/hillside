/**
 * Generates responsive variants of the site's photography and brand marks.
 *
 * The site had none. Every `<img>` carried a single source, so a phone at 320
 * CSS pixels downloaded exactly what a 1920px monitor did — the 1600x1200 brand
 * masters, at 100-240 KB each. `ResilientImage` already accepted `srcSet` and
 * `sizes` and already stripped both correctly when falling back to the
 * placeholder; no caller had ever passed them.
 *
 * Variants are generated here and committed, rather than resized on demand,
 * because the existing photography pipeline already commits its processed output
 * to `public/` and because it keeps `sharp` out of the deploy. Widths are fixed
 * and small in number so the manifest stays readable.
 *
 * Idempotent: a variant newer than its master is left alone. Pass --force to
 * regenerate everything.
 *
 *   node scripts/build-image-variants.mjs [--force]
 */
import { readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { DIRECTORIES, GRADE, MIN_QUALITY, START_QUALITY, parseArgs } from './lib/photo.mjs';

const args = parseArgs(process.argv.slice(2));
const force = Boolean(args.force);

/**
 * The rendered widths that actually occur on the site, doubled for retina.
 * A product card is ~360px on a phone and ~300px in a desktop grid; the hero and
 * care-guide images run full-bleed. 1200 is the widest anything is displayed, so
 * there is no 1600 variant — the master stays as the last resort for very wide
 * screens via the srcset's final entry.
 */
const WIDTHS = [400, 800, 1200];

/** Brand marks are flat artwork, not photographs, and get no colour grade. */
const BRAND_MARKS = [
  { source: 'public/logo.png', width: 320, out: 'public/logo.webp' },
  { source: 'public/logo-badge.png', width: 480, out: 'public/logo-badge.webp' }
];

/**
 * Favicons, as PNG. The site declared the 296 KB full-resolution `logo.png` as
 * both its icon and its apple-touch icon, so every page load fetched it a second
 * time purely to draw a 16px browser-tab image — it was the single largest
 * resource on the site. These are the two sizes the declaration actually needs.
 */
const ICONS = [
  { source: 'public/logo.png', size: 64, out: 'public/icon.png' },
  { source: 'public/logo.png', size: 180, out: 'public/apple-icon.png' }
];

const PHOTO_DIRECTORIES = [DIRECTORIES.catalog, DIRECTORIES.scenes, DIRECTORIES.gallery];

async function isStale(source, target) {
  if (force) return true;
  try {
    const [sourceStat, targetStat] = await Promise.all([stat(source), stat(target)]);
    return sourceStat.mtimeMs > targetStat.mtimeMs;
  } catch {
    return true;
  }
}

/**
 * Encodes to WebP under a byte ceiling by walking quality down, the same
 * approach `lib/photo.mjs` takes for the masters — a fixed quality produces wildly
 * different sizes across a set that ranges from flat foliage to busy driftwood.
 */
async function encodeUnderBudget(pipeline, budgetBytes) {
  let quality = START_QUALITY;
  let buffer = await pipeline.clone().webp({ quality }).toBuffer();

  while (buffer.length > budgetBytes && quality > MIN_QUALITY) {
    quality -= 6;
    buffer = await pipeline.clone().webp({ quality }).toBuffer();
  }
  return { buffer, quality };
}

/** Roughly proportional to area, so a 400w variant is not held to a 1200w budget. */
function budgetFor(width) {
  return Math.round(400_000 * (width / 1600) ** 2 * 1.6);
}

const manifest = {};
let written = 0;
let skipped = 0;

for (const directory of PHOTO_DIRECTORIES) {
  let entries;
  try {
    entries = await readdir(directory);
  } catch {
    continue;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.webp')) continue;
    // Skip variants of variants.
    if (/-\d+w\.webp$/.test(entry)) continue;

    const source = path.join(directory, entry);
    const base = entry.replace(/\.webp$/, '');
    const publicBase = `/${path.relative('public', directory)}/${entry}`.replace(/\\/g, '/');
    const metadata = await sharp(source).metadata();
    const available = [];

    for (const width of WIDTHS) {
      // Never upscale: a 400w variant of a 300px source is bytes for nothing.
      if (metadata.width && width >= metadata.width) continue;

      const target = path.join(directory, `${base}-${width}w.webp`);
      available.push(width);

      if (!(await isStale(source, target))) {
        skipped += 1;
        continue;
      }

      const pipeline = sharp(source)
        .resize(width, null, { fit: 'inside', withoutEnlargement: true })
        .modulate({ saturation: GRADE.saturation, brightness: GRADE.brightness });

      const { buffer, quality } = await encodeUnderBudget(pipeline, budgetFor(width));
      await writeFile(target, buffer);
      written += 1;
      console.log(
        `  ${path.relative(process.cwd(), target)}  ${(buffer.length / 1024).toFixed(0)} KB  q${quality}`
      );
    }

    if (metadata.width) available.push(metadata.width);
    if (available.length > 1) manifest[publicBase] = available;
  }
}

console.log('\nBrand marks');
for (const mark of BRAND_MARKS) {
  if (!(await isStale(mark.source, mark.out))) {
    skipped += 1;
    continue;
  }
  await mkdir(path.dirname(mark.out), { recursive: true });
  const buffer = await sharp(mark.source)
    .resize(mark.width, null, { fit: 'inside', withoutEnlargement: true })
    /**
     * Lossy at high quality rather than lossless. The mark is a painted botanical
     * illustration, not flat vector artwork, so lossless has little to exploit —
     * measured at 320px it saved nothing on the wordmark and cost 20 KB on the
     * badge. Quality 90 is visually indistinguishable at the sizes these render.
     */
    .webp({ quality: 90, effort: 6, alphaQuality: 100 })
    .toBuffer();
  await writeFile(mark.out, buffer);
  written += 1;
  console.log(`  ${mark.out}  ${(buffer.length / 1024).toFixed(0)} KB  (${mark.width}px wide)`);
}

console.log('\nIcons');
for (const icon of ICONS) {
  if (!(await isStale(icon.source, icon.out))) {
    skipped += 1;
    continue;
  }
  const buffer = await sharp(icon.source)
    .resize(icon.size, icon.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  await writeFile(icon.out, buffer);
  written += 1;
  console.log(`  ${icon.out}  ${(buffer.length / 1024).toFixed(1)} KB  (${icon.size}px)`);
}

const generated = `/**
 * Generated by scripts/build-image-variants.mjs — do not edit by hand.
 *
 * Maps a public image path to the widths that exist beside it, so
 * lib/image-srcset.ts can build a srcset without touching the filesystem at
 * request time. Run \`npm run images:variants\` after adding photography.
 */
export const IMAGE_VARIANTS: Record<string, number[]> = ${JSON.stringify(
  Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))),
  null,
  2
)};
`;

await writeFile('lib/image-variants.ts', generated);

console.log(`\n${written} written, ${skipped} up to date, ${Object.keys(manifest).length} sources in manifest.`);
