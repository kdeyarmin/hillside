import { PrismaClient } from '@prisma/client';
import {
  hashPassword,
  looksLikeEmail,
  normalizeAdminEmail,
  passwordComplaint
} from '../lib/admin-credentials';

/**
 * Creates or updates one admin account. Passwords are never committed to this
 * repository, so the credentials come from flags or from the environment:
 *
 *   npm run admin:create -- --email owner@example.com --name "Full Name" --password '...'
 *   ADMIN_ACCOUNT_EMAIL=... ADMIN_ACCOUNT_NAME=... ADMIN_ACCOUNT_PASSWORD=... npm run admin:create
 *
 * Re-running with the same email resets that account's password and name
 * rather than failing, which is what makes it safe on every deploy. With
 * `--optional` a missing email or password is a no-op instead of an error,
 * so the pre-deploy step stays quiet on installs that do not use it.
 */
const db = new PrismaClient();

function flag(name: string) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? '' : process.argv[index + 1] || '';
  return value.startsWith('--') ? '' : value;
}

async function main() {
  const optional = process.argv.includes('--optional');
  const email = normalizeAdminEmail(flag('email') || process.env.ADMIN_ACCOUNT_EMAIL || '');
  const password = flag('password') || process.env.ADMIN_ACCOUNT_PASSWORD || '';
  const name = (flag('name') || process.env.ADMIN_ACCOUNT_NAME || '').trim();
  const deactivate = process.argv.includes('--deactivate');

  if (!email || (!password && !deactivate)) {
    if (optional) {
      console.log('admin:create — no ADMIN_ACCOUNT_EMAIL/ADMIN_ACCOUNT_PASSWORD configured, skipping.');
      return;
    }
    throw new Error(
      deactivate
        ? 'An email is required. Pass --email, or set ADMIN_ACCOUNT_EMAIL.'
        : 'An email and password are required. Pass --email and --password, or set ADMIN_ACCOUNT_EMAIL and ADMIN_ACCOUNT_PASSWORD.'
    );
  }

  if (!looksLikeEmail(email)) throw new Error(`"${email}" does not look like an email address.`);

  if (deactivate) {
    const target = await db.adminUser.findUnique({ where: { email } });
    if (!target) throw new Error(`There is no admin account for ${email}.`);

    /**
     * Nothing else stops this one. The dashboard refuses to switch off the
     * account you are signed in with, which is enough to keep a way in from
     * there — but this command has no session behind it and would happily
     * revoke the last account on a site with no shared password left, locking
     * the shop out of its own dashboard.
     */
    if (target.active && !process.env.ADMIN_PASSWORD && !process.argv.includes('--force')) {
      const remaining = await db.adminUser.count({ where: { active: true, id: { not: target.id } } });
      if (remaining === 0) {
        throw new Error(
          `${target.email} is the only account that can sign in, and ADMIN_PASSWORD is not set. ` +
            'Create another admin first, or pass --force to lock the dashboard deliberately.'
        );
      }
    }

    const disabled = await db.adminUser.update({ where: { id: target.id }, data: { active: false } });
    console.log(`Deactivated admin account ${disabled.email}. Their sessions end on the next request.`);
    return;
  }

  const complaint = passwordComplaint(password);
  if (complaint) throw new Error(complaint);

  const existing = await db.adminUser.findUnique({ where: { email } });

  /**
   * The deploy path only ever creates. ADMIN_ACCOUNT_* is documented as
   * something you leave configured, and railway.json runs this on every
   * deploy — so reconciling an existing account here would mean any unrelated
   * deployment silently reset that person's password back to the variable and
   * switched a revoked account back on. An account that already exists is the
   * database's business, not the environment's.
   */
  if (existing && optional) {
    console.log(`admin:create — ${existing.email} already exists, leaving it unchanged.`);
    return;
  }

  const account = await db.adminUser.upsert({
    where: { email },
    create: { email, name: name || email, passwordHash: hashPassword(password), passwordChangedAt: new Date() },
    update: {
      passwordHash: hashPassword(password),
      passwordChangedAt: new Date(),
      active: true,
      ...(name ? { name } : {})
    }
  });

  console.log(
    existing
      ? `Updated admin account for ${account.name} <${account.email}>. Older sessions have been signed out.`
      : `Created admin account for ${account.name} <${account.email}>.`
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
