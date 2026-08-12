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
/**
 * The paper the mark is printed on.
 *
 * `plate` is a label stuck to a vessel — a bottle, a jar, a pot. `tag` is a
 * swing tag with a punched hole and a chamfered top, the thing a nursery ties to
 * a plant. `stake` is a tag on a spike, pushed into the soil. Shape matters more
 * than it sounds: a plain rectangle lying in a photograph reads as a watermark
 * no matter how well it is lit, because nothing in a plant shop is a plain
 * floating rectangle.
 */
function paperShape(shape, width, height, radius, paper, inset) {
  const w = width - inset * 2;
  const h = height - inset * 2;
  const x = inset;
  const y = inset;

  if (shape === 'tag') {
    // The swing-tag silhouette: the top corners are cut off on a straight
    // diagonal, not rounded. Rounding them produces a lozenge, which is what a
    // sticker looks like — the two clipped corners are the whole reason a tag is
    // recognisable as a tag at thumbnail size.
    const chamfer = Math.min(w, h) * 0.22;
    const hole = Math.max(2.5, Math.min(w, h) * 0.05);
    const holeX = x + w / 2;
    const holeY = y + chamfer * 0.62;

    // The hole is cut out of the card, not drawn on it: a second subpath wound
    // the same way as the first, resolved with the even-odd rule, so the
    // photograph shows through it and the twine has somewhere to go. Painting a
    // grey disc instead looks like a printed dot, which is worse than no hole.
    return `
      <path fill-rule="evenodd" fill="${paper}"
            d="M ${x + chamfer} ${y}
               L ${x + w - chamfer} ${y}
               L ${x + w} ${y + chamfer}
               L ${x + w} ${y + h - radius}
               Q ${x + w} ${y + h} ${x + w - radius} ${y + h}
               L ${x + radius} ${y + h}
               Q ${x} ${y + h} ${x} ${y + h - radius}
               L ${x} ${y + chamfer} Z
               M ${holeX - hole} ${holeY}
               a ${hole} ${hole} 0 1 0 ${hole * 2} 0
               a ${hole} ${hole} 0 1 0 ${-hole * 2} 0 Z"/>
      <circle cx="${holeX}" cy="${holeY}" r="${hole}"
              fill="none" stroke="rgba(96,80,58,0.45)" stroke-width="1.4"/>`;
  }

  if (shape === 'stake') {
    // A label on a spike: the card, then a narrow stem running off the bottom.
    const cardH = h * 0.72;
    const stemW = Math.max(3, w * 0.055);
    return `
      <rect x="${x}" y="${y}" width="${w}" height="${cardH}" rx="${radius}" ry="${radius}" fill="${paper}"/>
      <rect x="${x + w / 2 - stemW / 2}" y="${y + cardH - 2}" width="${stemW}" height="${h - cardH + 2}"
            fill="${paper}" fill-opacity="0.92"/>`;
  }

  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="${paper}"/>`;
}

async function labelArtwork({
  width,
  height,
  radius = 10,
  paper = '#f4efe3',
  logoScale = 0.72,
  badge = false,
  inset = 0,
  stamp = false,
  shape = 'plate'
}) {
  // A stamp has no paper of its own: the mark is inked straight onto the kraft,
  // so it is composited in multiply and the wrapper's grain reads through it.
  // Printing a cream plate onto brown paper would look like a sticker.
  const plate = Buffer.from(
    stamp
      ? `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"></svg>`
      : `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
           ${paperShape(shape, width, height, radius, paper, inset)}
         </svg>`
  );

  const source = badge ? LOGO_BADGE : LOGO;
  const meta = await sharp(source).metadata();

  // The mark prints on the card, not on the hole or the spike, so those shapes
  // hand it a smaller area to sit in and a centre of their own.
  const printable =
    shape === 'tag'
      ? { top: height * 0.3, height: height * 0.62 }
      : shape === 'stake'
        ? { top: height * 0.06, height: height * 0.6 }
        : { top: 0, height };

  const boxHeight = Math.round(printable.height * logoScale);
  const boxWidth = Math.round(boxHeight * (meta.width / meta.height));
  const fitted =
    boxWidth > width * 0.82
      ? { w: Math.round(width * 0.82), h: Math.round((width * 0.82) * (meta.height / meta.width)) }
      : { w: boxWidth, h: boxHeight };
  const markTop = Math.round(printable.top + (printable.height - fitted.h) / 2);

  let mark = sharp(source).resize(fitted.w, fitted.h, { fit: 'inside' });
  if (stamp) {
    // Ink, not artwork: fade the mark so the wrapper shows through the way a
    // real stamp on absorbent paper does.
    mark = mark.ensureAlpha().linear([1, 1, 1, 0.88], [0, 0, 0, 0]);
  }
  const markBuffer = await mark.png().toBuffer();

  return sharp(plate)
    .composite([{ input: markBuffer, left: Math.round((width - fitted.w) / 2), top: markTop }])
    .png()
    .toBuffer();
}

/**
 * Drops a soft shadow under the placed label so it reads as a physical object
 * resting on the scene rather than a graphic pasted over it. Built from the
 * label's own alpha, so it follows a tag's chamfer and hole exactly.
 */
async function shadowFor(layerPng, { offset = 6, blur = 7, opacity = 0.4 }) {
  const { width, height } = await sharp(layerPng).metadata();
  const alpha = await sharp(layerPng).ensureAlpha().extractChannel('alpha').blur(blur).toBuffer();

  const pad = Math.ceil(blur * 2 + offset);
  const shadow = await sharp({
    create: {
      width: width + pad * 2,
      height: height + pad * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      {
        input: await sharp({
          create: { width, height, channels: 3, background: { r: 24, g: 30, b: 20 } }
        })
          .joinChannel(alpha)
          .png()
          .toBuffer(),
        left: pad + Math.round(offset * 0.4),
        top: pad + offset
      }
    ])
    .png()
    .toBuffer();

  return {
    buffer: await sharp(shadow)
      .ensureAlpha()
      .linear([1, 1, 1, opacity], [0, 0, 0, 0])
      .png()
      .toBuffer(),
    pad
  };
}

/**
 * Softens a rectangle of the photograph until whatever is printed there stops
 * being readable.
 *
 * The licensed shots were taken in real shops, and some of them are full of
 * other companies' wordmarks — a shelf of somebody else's candles and soap,
 * photographed at a legible size, sitting on our own gallery page. Branding the
 * frame does not fix that; the other marks have to go.
 *
 * A local blur rather than a patch of flat colour: these are cluttered scenes
 * with real depth of field, so a softened label reads as something behind the
 * plane of focus, while a rectangle of paint reads as a redaction. The mask is
 * feathered for the same reason — a hard-edged blur has a visible seam.
 */
async function softenRegion(baseBuffer, region) {
  const { x, y, width, height, blur = 7, feather = 12, radius = 8 } = region;
  const meta = await sharp(baseBuffer).metadata();

  const left = Math.max(0, Math.round(x));
  const top = Math.max(0, Math.round(y));
  const w = Math.min(Math.round(width), meta.width - left);
  const h = Math.min(Math.round(height), meta.height - top);
  if (w <= 0 || h <= 0) {
    throw new Error(`Patch at ${x},${y} ${width}x${height} falls outside the photograph.`);
  }

  const blurred = await sharp(baseBuffer).extract({ left, top, width: w, height: h }).blur(blur).png().toBuffer();

  // White where the blur applies, fading to black at the edge. Blurring the
  // mask is what feathers it, so the rect is inset by the same amount to keep
  // the soft edge inside the region rather than spilling past it.
  const mask = await sharp(
    Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
         <rect width="${w}" height="${h}" fill="#000"/>
         <rect x="${feather}" y="${feather}" width="${Math.max(1, w - feather * 2)}"
               height="${Math.max(1, h - feather * 2)}" rx="${radius}" ry="${radius}" fill="#fff"/>
       </svg>`
    )
  )
    .blur(feather)
    .toColourspace('b-w')
    .toBuffer();

  const patch = await sharp(blurred).removeAlpha().joinChannel(mask).png().toBuffer();
  return sharp(baseBuffer).composite([{ input: patch, left, top }]).png().toBuffer();
}

/**
 * Where the punched hole ends up in the photograph, in source pixels.
 *
 * `paperShape` puts the hole on the tag's centre line, a fraction of the chamfer
 * down from the top edge. Rotation happens about the tag's centre, so the offset
 * from that centre is what has to be rotated — clockwise, because the y axis
 * points down and that is the direction `sharp`'s `rotate` turns.
 */
function holePosition({ x, y, width, height, angle = 0, inset = 0 }) {
  const chamfer = Math.min(width - inset * 2, height - inset * 2) * 0.22;
  const offsetY = inset + chamfer * 0.62 - height / 2;
  const radians = (angle * Math.PI) / 180;
  return {
    x: x - offsetY * Math.sin(radians),
    y: y + offsetY * Math.cos(radians)
  };
}

/**
 * The twine a swing tag hangs from.
 *
 * Without it a tag in mid-air is still a floating rectangle, however well it is
 * lit — a photograph of a plant has no shelf to rest one on, so the tag has to
 * be visibly tied to a stem. Drawn over the tag rather than under it, because
 * real twine passes through the hole and lies across the top of the card.
 *
 * The string sags: the control point of the curve is pushed down and across the
 * chord, so a tag hanging off to one side pulls a slack line rather than a taut
 * straight one.
 */
function tieArtwork(frame, from, to, { colour = '#b9a880', width = 3, sag = 0.28, knot = true } = {}) {
  const midX = (from[0] + to.x) / 2;
  const midY = (from[1] + to.y) / 2;
  const span = Math.hypot(to.x - from[0], to.y - from[1]);
  const controlY = midY + span * sag;

  return Buffer.from(
    `<svg width="${frame.width}" height="${frame.height}" xmlns="http://www.w3.org/2000/svg">
       <path d="M ${from[0]} ${from[1]} Q ${midX} ${controlY} ${to.x} ${to.y}"
             fill="none" stroke="rgba(60,52,36,0.30)" stroke-width="${width + 2.4}"
             stroke-linecap="round"/>
       <path d="M ${from[0]} ${from[1]} Q ${midX} ${controlY} ${to.x} ${to.y}"
             fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round"/>
       ${knot ? `<circle cx="${from[0]}" cy="${from[1]}" r="${width * 1.5}" fill="${colour}"/>` : ''}
     </svg>`
  );
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

  const layers = [];

  // A printed stamp is ink in the surface and casts nothing. Anything with paper
  // of its own — a label on a jar, a tag hanging off a stem — has to sit in the
  // light or it floats.
  if (!placement.stamp && placement.shadow !== false) {
    const { buffer: shadow, pad } = await shadowFor(layer, placement.shadow || {});
    const shadowLeft = left - pad;
    const shadowTop = top - pad;
    const cropX = Math.max(0, -shadowLeft);
    const cropY = Math.max(0, -shadowTop);
    const shadowMeta = await sharp(shadow).metadata();
    const w = Math.min(shadowMeta.width - cropX, baseMeta.width - Math.max(0, shadowLeft));
    const h = Math.min(shadowMeta.height - cropY, baseMeta.height - Math.max(0, shadowTop));
    if (w > 0 && h > 0) {
      layers.push({
        input: await sharp(shadow).extract({ left: cropX, top: cropY, width: w, height: h }).png().toBuffer(),
        left: Math.max(0, shadowLeft),
        top: Math.max(0, shadowTop)
      });
    }
  }

  layers.push({ input: layer, left, top, blend });

  if (placement.tie && !quad) {
    layers.push({
      input: tieArtwork(baseMeta, placement.tie.to, holePosition(placement), placement.tie),
      left: 0,
      top: 0
    });
  }

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

  // Retouch before branding, so a Hillside label placed over a competitor's is
  // composited onto the cleaned frame rather than being softened along with it.
  for (const patch of shot.patches || []) {
    buffer = await softenRegion(buffer, patch);
  }

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
