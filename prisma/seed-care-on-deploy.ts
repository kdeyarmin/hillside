import { PrismaClient } from '@prisma/client';
import { starterCareGuides } from '../lib/care-seed-data';

const db = new PrismaClient();

async function main() {
  let created = 0;
  let upgraded = 0;
  let preserved = 0;

  for (const guide of starterCareGuides) {
    const existing = await db.careSheet.findUnique({
      where: { slug: guide.slug },
      select: {
        id: true,
        category: true,
        difficulty: true,
        symptoms: true,
        checklist: true,
        featured: true,
        sortOrder: true
      }
    });

    if (!existing) {
      await db.careSheet.create({ data: guide });
      created += 1;
      continue;
    }

    const legacyGuide =
      !existing.category &&
      !existing.difficulty &&
      !existing.symptoms &&
      !existing.checklist &&
      !existing.featured &&
      existing.sortOrder === 0;

    if (legacyGuide) {
      await db.careSheet.update({ where: { id: existing.id }, data: guide });
      upgraded += 1;
    } else {
      preserved += 1;
    }
  }

  console.log(
    `Care library deploy seed complete: ${created} created, ${upgraded} legacy guides upgraded, ${preserved} existing guides preserved.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
