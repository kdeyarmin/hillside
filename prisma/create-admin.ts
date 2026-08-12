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
      'An email and password are required. Pass --email and --password, or set ADMIN_ACCOUNT_EMAIL and ADMIN_ACCOUNT_PASSWORD.'
    );
  }

  if (!looksLikeEmail(email)) throw new Error(`"${email}" does not look like an email address.`);

  if (deactivate) {
    const disabled = await db.adminUser.update({ where: { email }, data: { active: false } });
    console.log(`Deactivated admin account ${disabled.email}. Their sessions end on the next request.`);
    return;
  }

  const complaint = passwordComplaint(password);
  if (complaint) throw new Error(complaint);

  const existing = await db.adminUser.findUnique({ where: { email } });
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
