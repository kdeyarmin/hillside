import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'brand-assets-base64');
const outputRoot = path.join(projectRoot, 'public', 'images', 'brand');

const assets = [
  'hillside-hero-products.webp',
  'plant-care-display.webp',
  'tea-still-life.webp',
  'botanical-spa.webp',
  'gardening-workspace.webp'
];

await mkdir(outputRoot, { recursive: true });

for (const asset of assets) {
  const assetDirectory = path.join(sourceRoot, asset);
  const parts = (await readdir(assetDirectory))
    .filter((name) => /^part-\d+\.txt$/.test(name))
    .sort((left, right) => left.localeCompare(right));

  if (parts.length === 0) {
    throw new Error(`No encoded source parts were found for ${asset}.`);
  }

  const encodedParts = await Promise.all(
    parts.map((part) => readFile(path.join(assetDirectory, part), 'utf8'))
  );
  const encoded = encodedParts.join('').replace(/\s+/g, '');
  const image = Buffer.from(encoded, 'base64');

  const isWebP =
    image.length > 12 &&
    image.toString('ascii', 0, 4) === 'RIFF' &&
    image.toString('ascii', 8, 12) === 'WEBP';

  if (!isWebP) {
    throw new Error(`Decoded brand asset ${asset} is not a valid WebP image.`);
  }

  await writeFile(path.join(outputRoot, asset), image);
  console.log(`Prepared ${asset} (${image.length.toLocaleString()} bytes)`);
}
