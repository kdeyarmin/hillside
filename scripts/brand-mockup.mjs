#!/usr/bin/env node
/**
 * Puts the Hillside mark onto the packaging inside a real photograph.
 *
 * The storefront ships licensed photographs of *somebody's* amber bottles and
 * *somebody's* soap. This turns them into photographs of Hillside product by
 * printing the real logo onto the labels — the standard product-mockup
 * technique, and the reason the logo was supplied as transparent artwork.
 *
 * The label is not pasted flat. It is rotated onto the object's axis, then
 * relit from the luminance of the pixels it covers, so the bottle's own
 * highlight runs across it and its shadow side stays dark. A flat paste reads
 * as a sticker immediately; this does not.
 *
 * Placements live in `scripts/brand-mockup.config.mjs` so the geometry of each
 * shot is recorded rather than re-measured by hand every time.
 *
 * Usage:
 *   node scripts/brand-mockup.mjs                 # build every configured shot
 *   node scripts/brand-mockup.mjs --only apothecary
 *   node scripts/brand-mockup.mjs --only apothecary --debug   # draw label outlines
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { SHOTS } from './brand-mockup.config.mjs';

const LOGO = 'public/logo.png';
const LOGO_BADGE = 'public/logo-badge.png';

/** Matches the rest of the committed set; below MIN_QUALITY the artefacts show. */
const BUDGET_KB = 400;
const START_QUALITY = 84;
const MIN_QUALITY = 50;

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
 * Label stock: a rounded rectangle in the colour of the paper, with the mark
 * centred. Kept as an SVG so the corner radius and the paper tone stay crisp at
 * whatever size the shot needs.
 */
async function labelArtwork({
  width,
  height,
  radius = 10,
  paper = '#f4efe3',
  logoScale = 0.72,
  badge = false,
  inset = 0,
  stamp = false
}) {
  // A stamp has no paper of its own: the mark is inked straight onto the kraft,
  // so it is composited in multiply and the wrapper's grain reads through it.
  // Printing a cream plate onto brown paper would look like a sticker.
  const plate = Buffer.from(
    stamp
      ? `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"></svg>`
      : `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
           <rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}"
                 rx="${radius}" ry="${radius}" fill="${paper}"/>
         </svg>`
  );

  const source = badge ? LOGO_BADGE : LOGO;
  const meta = await sharp(source).metadata();
  const boxHeight = Math.round(height * logoScale);
  const boxWidth = Math.round(boxHeight * (meta.width / meta.height));
  const fitted =
    boxWidth > width * 0.9
      ? { w: Math.round(width * 0.9), h: Math.round((width * 0.9) * (meta.height / meta.width)) }
      : { w: boxWidth, h: boxHeight };

  let mark = sharp(source).resize(fitted.w, fitted.h, { fit: 'inside' });
  if (stamp) {
    // Ink, not artwork: fade the mark so the wrapper shows through the way a
    // real stamp on absorbent paper does.
    mark = mark.ensureAlpha().linear([1, 1, 1, 0.88], [0, 0, 0, 0]);
  }
  const markBuffer = await mark.png().toBuffer();

  return sharp(plate)
    .composite([
      { input: markBuffer, left: Math.round((width - fitted.w) / 2), top: Math.round((height - fitted.h) / 2) }
    ])
    .png()
    .toBuffer();
}

/**
 * Rebuilds the light. `tile` is what the photograph has where the label lands;
 * its greyscale is flattened around white and multiplied into the label, so the
 * label darkens exactly where the object was already dark and carries the same
 * specular streak.
 */
async function relight(labelPng, tile, { strength = 0.5, curve = 0, blur = 9 } = {}) {
  const { width, height } = await sharp(labelPng).metadata();

  // Blur first, and hard. Printed paper takes the light falling on the object,
  // not the object's surface detail — without this the linen weave and the glass
  // texture print straight through the label and it reads as tracing paper.
  const grey = await sharp(tile).removeAlpha().greyscale().blur(blur).png().toBuffer();

  // Measured from the greyscale buffer, not from a chained pipeline: sharp's
  // stats() reports the *input* image and ignores operations queued before it,
  // so reading it off the chain returned the tile's red channel and normalised
  // every label against the wrong midpoint.
  const { channels } = await sharp(grey).stats();
  const mean = channels[0].mean;

  // out = slope*in + intercept, chosen so the average pixel maps to near-white
  // (leaving the paper its own colour) while relative light and shade survive.
  const slope = strength;
  const intercept = 248 - slope * mean;
  let shading = await sharp(grey).linear(slope, intercept).toColourspace('b-w').png().toBuffer();

  if (curve > 0) {
    // Cylindrical falloff across the label's short axis, for a bottle or jar.
    const edge = Math.round(255 * (1 - curve));
    const gradient = Buffer.from(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
         <defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0%" stop-color="rgb(${edge},${edge},${edge})"/>
           <stop offset="42%" stop-color="#ffffff"/>
           <stop offset="100%" stop-color="rgb(${edge},${edge},${edge})"/>
         </linearGradient></defs>
         <rect width="${width}" height="${height}" fill="url(#c)"/>
       </svg>`
    );
    shading = await sharp(shading)
      .composite([{ input: gradient, blend: 'multiply' }])
      .toColourspace('b-w')
      .png()
      .toBuffer();
  }

  // Multiply the shading into the colour channels, then restore the label's own
  // alpha — compositing over an opaque map would otherwise square off the
  // rounded corners the label was cut with.
  const alpha = await sharp(labelPng).ensureAlpha().extractChannel('alpha').png().toBuffer();
  const shaded = await sharp(labelPng)
    .removeAlpha()
    .composite([{ input: shading, blend: 'multiply' }])
    .png()
    .toBuffer();

  return sharp(shaded).joinChannel(alpha).png().toBuffer();
}

/**
 * Places a label on a parallelogram given three of its corners, so a band
 * wrapping a cylinder can be matched exactly. A rotation alone cannot: on the
 * twine tag the top edge sits 24 degrees off horizontal while the side edges are
 * only 4 degrees off vertical, and a rotated rectangle visibly disagrees with
 * the object it is supposed to be printed on.
 *
 * sharp's affine matrix is [[a, b], [c, d]] with x' = a·x + b·y, y' = c·x + d·y,
 * so the columns are the destination vectors for the label's own axes.
 */
async function transformToQuad(flatPng, quad) {
  const [tlx, tly] = quad.topLeft;
  const [trx, try_] = quad.topRight;
  const [blx, bly] = quad.bottomLeft;

  const u = [trx - tlx, try_ - tly];
  const v = [blx - tlx, bly - tly];
  const width = Math.hypot(u[0], u[1]);
  const height = Math.hypot(v[0], v[1]);
  const unitU = [u[0] / width, u[1] / width];
  const unitV = [v[0] / height, v[1] / height];

  const transformed = await sharp(flatPng)
    .affine([[unitU[0], unitV[0]], [unitU[1], unitV[1]]], {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      interpolator: 'bicubic'
    })
    .png()
    .toBuffer();

  // Where the label's own origin ended up inside the transformed bounding box.
  const minX = Math.min(0, u[0], v[0], u[0] + v[0]);
  const minY = Math.min(0, u[1], v[1], u[1] + v[1]);

  return { buffer: transformed, left: Math.round(tlx + minX), top: Math.round(tly + minY), width, height };
}

async function applyLabel(baseBuffer, placement, debug) {
  const { x, y, angle = 0, quad } = placement;

  let rotated;
  let rawLeft;
  let rawTop;

  if (quad) {
    const [tlx, tly] = quad.topLeft;
    const [trx, try_] = quad.topRight;
    const [blx, bly] = quad.bottomLeft;
    const flat = await labelArtwork({
      ...placement,
      width: Math.round(Math.hypot(trx - tlx, try_ - tly)),
      height: Math.round(Math.hypot(blx - tlx, bly - tly))
    });
    const placed = await transformToQuad(flat, quad);
    rotated = placed.buffer;
    rawLeft = placed.left;
    rawTop = placed.top;
  } else {
    const flat = await labelArtwork(placement);
    rotated = await sharp(flat)
      .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const meta = await sharp(rotated).metadata();
    rawLeft = Math.round(x - meta.width / 2);
    rawTop = Math.round(y - meta.height / 2);
  }

  const rotatedMeta = await sharp(rotated).metadata();

  // A label on a real object frequently runs off the edge of the frame, so the
  // placement is clipped to the photograph rather than refused. Only the part
  // that overlaps is composited, and it keeps its position.
  const baseMeta = await sharp(baseBuffer).metadata();
  const cropLeft = Math.max(0, -rawLeft);
  const cropTop = Math.max(0, -rawTop);
  const left = Math.max(0, rawLeft);
  const top = Math.max(0, rawTop);
  const visibleWidth = Math.min(rotatedMeta.width - cropLeft, baseMeta.width - left);
  const visibleHeight = Math.min(rotatedMeta.height - cropTop, baseMeta.height - top);

  if (visibleWidth <= 0 || visibleHeight <= 0) {
    // A quad placement carries no x/y, so naming them here printed
    // "undefined,undefined" — useless for the one thing this error exists to
    // help with, which is finding the mis-measured coordinate.
    const where = quad
      ? `quad topLeft ${quad.topLeft}, topRight ${quad.topRight}, bottomLeft ${quad.bottomLeft}`
      : `centre ${x},${y}`;
    throw new Error(
      `Label "${placement.name}" (${where}) resolves to ${rawLeft},${rawTop} ` +
        `${rotatedMeta.width}x${rotatedMeta.height}, entirely outside the ` +
        `${baseMeta.width}x${baseMeta.height} photograph.`
    );
  }

  const clipped =
    cropLeft || cropTop || visibleWidth !== rotatedMeta.width || visibleHeight !== rotatedMeta.height;
  const visible = clipped
    ? await sharp(rotated)
        .extract({ left: cropLeft, top: cropTop, width: visibleWidth, height: visibleHeight })
        .png()
        .toBuffer()
    : rotated;

  // A stamp is ink on the object, so multiply does the relighting for free: the
  // wrapper's own shading and grain survive underneath it. A paper label sits on
  // top of the object and has to be lit explicitly.
  let layer;
  let blend;
  if (placement.stamp) {
    layer = visible;
    blend = 'multiply';
  } else {
    const tile = await sharp(baseBuffer)
      .extract({ left, top, width: visibleWidth, height: visibleHeight })
      .png()
      .toBuffer();
    layer = await relight(visible, tile, placement);
    blend = placement.blend || 'over';
  }

  const layers = [{ input: layer, left, top, blend }];
  if (debug) {
    layers.push({
      input: Buffer.from(
        `<svg width="${visibleWidth}" height="${visibleHeight}" xmlns="http://www.w3.org/2000/svg">
           <rect x="1" y="1" width="${visibleWidth - 2}" height="${visibleHeight - 2}"
                 fill="none" stroke="#ff0050" stroke-width="3"/>
         </svg>`
      ),
      left,
      top
    });
  }

  return sharp(baseBuffer).composite(layers).png().toBuffer();
}

async function buildShot(shot, { debug }) {
  let buffer = await readFile(shot.base);
  // Work in PNG so repeated composites never accumulate WebP artefacts.
  buffer = await sharp(buffer).png().toBuffer();

  for (const placement of shot.labels) {
    buffer = await applyLabel(buffer, placement, debug);
  }

  const outPath = debug ? shot.out.replace(/\.webp$/, '.debug.png') : shot.out;
  if (debug) {
    await writeFile(outPath, buffer);
  } else {
    // Match the rest of the set: WebP, under the budget. The budget is a promise
    // the docs make about every committed image, so failing to meet it has to be
    // an error rather than an oversized file nobody notices.
    let quality = START_QUALITY;
    let output = await sharp(buffer).webp({ quality, effort: 6 }).toBuffer();
    while (output.length / 1024 > BUDGET_KB && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 6);
      output = await sharp(buffer).webp({ quality, effort: 6 }).toBuffer();
    }

    if (output.length / 1024 > BUDGET_KB) {
      throw new Error(
        `${shot.name} comes out at ${(output.length / 1024).toFixed(0)} kb even at quality ` +
          `${MIN_QUALITY}, over the ${BUDGET_KB} kb budget. Use a less detailed source photograph.`
      );
    }

    await writeFile(outPath, output);
    console.log(`${outPath}  ${(output.length / 1024).toFixed(0)} kb  q${quality}  ${shot.labels.length} label(s)`);
    return;
  }
  console.log(`${outPath} (debug)`);
}

const args = parseArgs(process.argv.slice(2));
try {
  const wanted = typeof args.only === 'string' ? args.only.split(',') : null;
  const shots = SHOTS.filter((shot) => !wanted || wanted.includes(shot.name));
  if (!shots.length) throw new Error(`No shot matched --only ${args.only}`);
  for (const shot of shots) await buildShot(shot, { debug: Boolean(args.debug) });
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}
