/**
 * Applies schema migrations on deploy, baselining an existing database the
 * first time it runs.
 *
 * ## Why this exists
 *
 * The shop was deployed with `prisma db push --accept-data-loss` for its whole
 * life. That command has no history and no review step: it makes the database
 * match the schema by whatever means necessary, and the flag pre-approves the
 * destructive half. Renaming a column in `schema.prisma` — the ordinary way to
 * improve a name — would have dropped the old column and everything in it on the
 * next deploy, silently, with the deploy reported as successful. For a shop whose
 * database holds every order it has ever taken, that is the wrong default.
 *
 * `prisma migrate deploy` applies reviewed SQL files and refuses anything it was
 * not given, so a destructive change has to be written down before it can happen.
 *
 * ## The baselining problem
 *
 * `migrate deploy` expects to be the only thing that has ever touched the
 * database. Pointed at one that `db push` already built, it finds the tables from
 * `0_init` already present, tries to create them again, and fails the deploy.
 *
 * Prisma's documented answer is to run `prisma migrate resolve --applied 0_init`
 * once by hand, which marks that migration as already-applied without running it.
 * A manual step that must happen exactly once, between a merge and a deploy, is a
 * step that gets missed — so this script detects the situation and does it, which
 * makes the transition safe to deploy like any other change.
 *
 * ## What it does
 *
 * - Fresh database, no tables: nothing to baseline. `migrate deploy` creates
 *   everything from `0_init` onward.
 * - Existing `db push` database, no migration history: records `0_init` as
 *   applied (it is — those tables are there), then applies everything after it.
 * - Already on migrations: applies whatever is new. This is every deploy after
 *   the first, and the branch that does nothing special.
 */

import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/** The migration that describes the schema as `db push` left it. */
const BASELINE = '0_init';

/** A table that exists in every version of this schema, used to tell an
 *  already-built database from an empty one. */
const SENTINEL_TABLE = 'public."Product"';

async function tableExists(db: PrismaClient, qualifiedName: string) {
  const rows = await db.$queryRawUnsafe<Array<{ present: boolean }>>(
    `SELECT to_regclass('${qualifiedName}') IS NOT NULL AS present`
  );
  return Boolean(rows[0]?.present);
}

async function appliedMigrationCount(db: PrismaClient) {
  const rows =
    await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations"`;
  return Number(rows[0]?.count ?? 0);
}

function runPrisma(args: string[]) {
  execFileSync('npx', ['prisma', ...args], { stdio: 'inherit' });
}

async function needsBaseline(db: PrismaClient) {
  // Nothing here yet — `migrate deploy` builds it from scratch.
  if (!(await tableExists(db, SENTINEL_TABLE))) return false;

  // Tables but no history: the `db push` database this script was written for.
  if (!(await tableExists(db, 'public."_prisma_migrations"'))) return true;

  /**
   * A history table with nothing in it is the same situation. It happens when a
   * previous run created the table and then failed before recording anything —
   * without this branch that state would need the manual fix all over again.
   */
  return (await appliedMigrationCount(db)) === 0;
}

async function main() {
  const db = new PrismaClient();
  try {
    if (await needsBaseline(db)) {
      console.log(
        `Existing database with no migration history: recording ${BASELINE} as already applied.`
      );
      runPrisma(['migrate', 'resolve', '--applied', BASELINE]);
    }
  } finally {
    // Released before `migrate deploy` runs: it takes an advisory lock of its
    // own, and holding an idle client through it serves no purpose.
    await db.$disconnect();
  }

  runPrisma(['migrate', 'deploy']);
}

main().catch((error) => {
  // A non-zero exit stops the deploy. That is the point: a half-migrated schema
  // serving customers is worse than a release that did not go out.
  console.error('Schema migration failed; stopping the deploy.', error);
  process.exit(1);
});
