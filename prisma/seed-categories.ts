import { PrismaClient } from '@prisma/client';
import { backfillCategorySlug, CATEGORY_SEEDS } from '../lib/product-categories';

const db = new PrismaClient();

/**
 * Puts the merchandising taxonomy in place and gives every existing product a
 * category, without ever undoing a decision the owner has made.
 *
 * Runs on every deploy, so both halves are written to be safe to repeat:
 *
 * - a category is *created* when its slug is missing and left completely alone
 *   when it is there. Re-seeding titles or descriptions would undo a rename,
 *   and re-seeding `active` would put back a category she retired;
 * - a product is only categorised when it has no category at all. Once a row
 *   has one — seeded or chosen by hand — no later deploy touches it.
 *
 * The keyword matching that picks the first category for an old row is a guess,
 * and it is meant to be: it is better for a plant to land in Houseplants and be
 * moved than to sit uncategorised and drop out of the shop's filters.
 */
async function main() {
  let created = 0;
  for (const seed of CATEGORY_SEEDS) {
    const existing = await db.category.findUnique({
      where: { slug: seed.slug },
      select: { id: true }
    });
    if (existing) continue;

    await db.category.create({
      data: {
        slug: seed.slug,
        title: seed.title,
        tagline: seed.tagline,
        description: seed.description,
        imageUrl: seed.imageUrl || null,
        specKind: seed.specKind,
        legacyType: seed.legacyType,
        sortOrder: seed.sortOrder
      }
    });
    created += 1;
  }

  const categories = await db.category.findMany({ select: { id: true, slug: true } });
  const idBySlug = new Map(categories.map((category) => [category.slug, category.id]));

  const uncategorised = await db.product.findMany({
    where: { categoryId: null },
    select: { id: true, name: true, slug: true, type: true }
  });

  let assigned = 0;
  for (const product of uncategorised) {
    const categoryId = idBySlug.get(backfillCategorySlug(product));
    if (!categoryId) continue;
    await db.product.update({ where: { id: product.id }, data: { categoryId } });
    assigned += 1;
  }

  console.log(
    `Categories ready: ${created} created, ${assigned} product${assigned === 1 ? '' : 's'} categorised.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
