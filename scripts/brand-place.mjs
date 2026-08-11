#!/usr/bin/env node
/**
 * Suggests where a label can sit in a photograph.
 *
 * Hand-measuring a placement is right when the mark has to land on a specific
 * object — a bottle, a kraft band. For the rest of the set there is no such
 * object, only "somewhere calm enough to read a tag", and measuring thirteen of
 * those by eye is slow and no more accurate than this is.
 *
 * Scores every candidate position on three things a label needs: low local
 * detail so the mark stays legible, mid-range brightness so it neither blows out
 * nor disappears, and distance from the centre so it does not sit on the subject.
 * Prints a config block to paste into brand-mockup.config.mjs, so the chosen
 * numbers stay explicit and editable rather than being recomputed on every run.
 *
 * Usage:
 *   node scripts/brand-place.mjs public/images/catalog/moss.webp
 *   node scripts/brand-place.mjs public/images/catalog/moss.webp --width 0.24
 */
import sharp from 'sharp';

const SAMPLE_WIDTH = 320;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const next = argv[i + 1];
    args[token.slice(2)] = next && !next.startsWith('--') ? (i += 1, next) : true;
  }
  return args;
}

/**
 * Mean and standard deviation of a rectangle in a greyscale buffer. Computed
 * directly over the pixels rather than through sharp, because sharp's stats()
 * reports the input image and ignores a queued extract.
 */
function regionStats(data, stride, left, top, width, height) {
  let sum = 0;
  let sumSquares = 0;
  const count = width * height;
  for (let y = top; y < top + height; y += 1) {
    const row = y * stride;
    for (let x = left; x < left + width; x += 1) {
      const value = data[row + x];
      sum += value;
      sumSquares += value * value;
    }
  }
  const mean = sum / count;
  return { mean, deviation: Math.sqrt(Math.max(0, sumSquares / count - mean * mean)) };
}

async function suggest(file, widthFraction) {
  const source = sharp(file);
  const meta = await source.metadata();
  const scale = SAMPLE_WIDTH / meta.width;
  const sampleHeight = Math.round(meta.height * scale);

  const { data } = await source
    .clone()
    .greyscale()
    .resize(SAMPLE_WIDTH, sampleHeight, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const labelWidth = Math.round(SAMPLE_WIDTH * widthFraction);
  const labelHeight = Math.round(labelWidth * 0.62);
  const step = 6;

  let best = null;
  for (let top = 0; top + labelHeight <= sampleHeight; top += step) {
    for (let left = 0; left + labelWidth <= SAMPLE_WIDTH; left += step) {
      const { mean, deviation } = regionStats(data, SAMPLE_WIDTH, left, top, labelWidth, labelHeight);

      // Busy areas make the mark unreadable, so detail dominates the score.
      const detail = deviation;
      // Very dark or very bright regions give the paper nothing to sit against.
      const exposure = Math.abs(mean - 140) / 140;
      // Nudge away from dead centre, where the subject usually is.
      const cx = (left + labelWidth / 2) / SAMPLE_WIDTH - 0.5;
      const cy = (top + labelHeight / 2) / sampleHeight - 0.5;
      const centrality = Math.max(0, 0.45 - Math.hypot(cx, cy));

      const score = detail + exposure * 26 + centrality * 34;
      if (!best || score < best.score) {
        best = { score, left, top, mean, deviation };
      }
    }
  }

  const toSource = (value) => Math.round(value / scale);
  return {
    x: toSource(best.left + labelWidth / 2),
    y: toSource(best.top + labelHeight / 2),
    width: toSource(labelWidth),
    height: toSource(labelHeight),
    meanBrightness: Math.round(best.mean),
    detail: best.deviation.toFixed(1)
  };
}

const args = parseArgs(process.argv.slice(2));
const files = process.argv.slice(2).filter((token) => !token.startsWith('--') && /\.(webp|jpe?g|png)$/i.test(token));
const widthFraction = Number(args.width ?? 0.22);

try {
  if (!files.length) throw new Error('Pass at least one image path.');
  for (const file of files) {
    const s = await suggest(file, widthFraction);
    console.log(
      `${file}\n  x: ${s.x}, y: ${s.y}, width: ${s.width}, height: ${s.height}   ` +
        `(brightness ${s.meanBrightness}, detail ${s.detail})`
    );
  }
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}
