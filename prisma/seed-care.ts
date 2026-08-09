import { PrismaClient } from '@prisma/client';
import { starterCareGuides } from '../lib/care-seed-data';

const db = new PrismaClient();

async function main() {
  let created = 0;
  let updated = 0;

  for (const guide of starterCareGuides) {
    const existing = await db.careSheet.findUnique({ where: { slug: guide.slug } });
    await db.careSheet.upsert({
      where: { slug: guide.slug },
      update: guide,
      create: guide
    });
    if (existing) updated += 1;
    else created += 1;
  }

  console.log(`Plant care library ready: ${created} created, ${updated} updated.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
