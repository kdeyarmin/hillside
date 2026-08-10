import { PrismaClient } from '@prisma/client';
import { resolveImageUrl } from '../lib/store';

/**
 * Rewrites stored image URLs that point at deleted upstream photos.
 *
 * The care deploy seed deliberately preserves existing rows so it never
 * clobbers the owner's edits, which means rows seeded before the images moved
 * local still hold Unsplash ids that now 404. Rendering already survives that
 * (ResilientImage resolves them), but the stored value still leaks into
 * og:image and JSON-LD, so shared links and rich results advertise a dead
 * photo.
 *
 * This only touches rows whose current value resolves to something different —
 * that is, only known-dead ids. Anything else, including owner uploads and
 * working remote URLs, is left exactly as it is. Safe to run repeatedly.
 */

const db = new PrismaClient();

type Repairable = {
  label: string;
  findMany: () => Promise<Array<{ id: string; imageUrl: string | null }>>;
  update: (id: string, imageUrl: string) => Promise<unknown>;
};

async function main() {
  const models: Repairable[] = [
    {
      label: 'Product',
      findMany: () => db.product.findMany({ select: { id: true, imageUrl: true } }),
      update: (id, imageUrl) => db.product.update({ where: { id }, data: { imageUrl } })
    },
    {
      label: 'CareSheet',
      findMany: () => db.careSheet.findMany({ select: { id: true, imageUrl: true } }),
      update: (id, imageUrl) => db.careSheet.update({ where: { id }, data: { imageUrl } })
    },
    {
      label: 'ClassEvent',
      findMany: () => db.classEvent.findMany({ select: { id: true, imageUrl: true } }),
      update: (id, imageUrl) => db.classEvent.update({ where: { id }, data: { imageUrl } })
    },
    {
      label: 'GalleryItem',
      findMany: () => db.galleryItem.findMany({ select: { id: true, imageUrl: true } }),
      update: (id, imageUrl) => db.galleryItem.update({ where: { id }, data: { imageUrl } })
    },
    {
      label: 'AmazonPick',
      findMany: () => db.amazonPick.findMany({ select: { id: true, imageUrl: true } }),
      update: (id, imageUrl) => db.amazonPick.update({ where: { id }, data: { imageUrl } })
    }
  ];

  let repaired = 0;
  for (const model of models) {
    const rows = await model.findMany();
    let count = 0;
    for (const row of rows) {
      if (!row.imageUrl?.trim()) continue;
      const resolved = resolveImageUrl(row.imageUrl);
      if (resolved === row.imageUrl) continue;
      await model.update(row.id, resolved);
      count += 1;
    }
    repaired += count;
    if (count) console.log(`  ${model.label}: ${count} repaired`);
  }

  console.log(
    repaired
      ? `Image URL repair complete: ${repaired} row(s) updated.`
      : 'Image URL repair complete: nothing to repair.'
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
