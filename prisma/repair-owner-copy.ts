import { PrismaClient } from '@prisma/client';

/**
 * Rewrites stored copy that still names Tammy in the third person.
 *
 * The site now speaks in the first person, but three of those strings were
 * seeded into the database rather than rendered from source, and the deploy
 * command runs `db push`, the care seed and the image repair — never
 * `prisma/seed.ts`. Without this, a deployment initialized before the copy
 * change keeps serving the old wording from its own rows.
 *
 * Every rule matches the seeded text exactly, so a record the owner has since
 * reworded is left alone: the value no longer matches, so it is skipped. Safe
 * to run repeatedly — a second run finds nothing to do.
 */

const db = new PrismaClient();

type Rule = {
  label: string;
  from: string;
  to: string;
  count: (from: string) => Promise<number>;
  update: (from: string, to: string) => Promise<{ count: number }>;
};

const rules: Rule[] = [
  {
    label: 'Product.badge',
    from: 'Tammy’s pick',
    to: 'Our pick',
    count: (badge) => db.product.count({ where: { badge } }),
    update: (badge, next) =>
      db.product.updateMany({ where: { badge }, data: { badge: next } })
  },
  {
    label: 'CareSheet.summary',
    from: 'A forgiving trailing classic and one of Tammy’s favorite beginner houseplants.',
    to: 'A forgiving trailing classic and one of our favorite beginner houseplants.',
    count: (summary) => db.careSheet.count({ where: { summary } }),
    update: (summary, next) =>
      db.careSheet.updateMany({ where: { summary }, data: { summary: next } })
  },
  {
    label: 'ClassEvent.description',
    from: 'Tammy guides you through choosing compatible plants, balancing color and texture, potting correctly and caring for your finished arrangement.',
    to: 'We guide you through choosing compatible plants, balancing color and texture, potting correctly and caring for your finished arrangement.',
    count: (description) => db.classEvent.count({ where: { description } }),
    update: (description, next) =>
      db.classEvent.updateMany({ where: { description }, data: { description: next } })
  }
];

async function main() {
  let updated = 0;

  for (const rule of rules) {
    const pending = await rule.count(rule.from);
    if (!pending) continue;
    const result = await rule.update(rule.from, rule.to);
    updated += result.count;
    console.log(`  ${rule.label}: ${result.count} updated`);
  }

  console.log(
    updated
      ? `Owner copy repair complete: ${updated} row(s) updated.`
      : 'Owner copy repair complete: nothing to repair.'
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
