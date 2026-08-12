'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentAdmin, isAdmin } from '@/lib/admin';
import {
  hashPassword,
  looksLikeEmail,
  normalizeAdminEmail,
  passwordComplaint
} from '@/lib/admin-credentials';
import { db } from '@/lib/db';

const text = (form: FormData, name: string) => String(form.get(name) || '').trim();

async function guard() {
  if (!(await isAdmin())) redirect('/admin');
}

function refresh() {
  revalidatePath('/admin/accounts');
  revalidatePath('/admin');
}

function done(status: string) {
  refresh();
  redirect(`/admin/accounts?status=${status}`);
}

export async function createAdminAccount(formData: FormData) {
  await guard();
  const name = text(formData, 'name');
  const email = normalizeAdminEmail(text(formData, 'email'));
  const password = String(formData.get('password') || '');

  if (!name) done('name-required');
  if (!looksLikeEmail(email)) done('email-invalid');
  const complaint = passwordComplaint(password);
  if (complaint) done('password-weak');

  /**
   * Creating over an address that already has an account would silently reset
   * that person's password, which is not what "add an admin" should ever do.
   * The row's own reset control is the deliberate way to do that.
   */
  if (await db.adminUser.findUnique({ where: { email }, select: { id: true } })) done('email-taken');

  await db.adminUser.create({
    data: { name, email, passwordHash: hashPassword(password), passwordChangedAt: new Date() }
  });
  done('created');
}

export async function resetAdminPassword(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const password = String(formData.get('password') || '');

  if (passwordComplaint(password)) done('password-weak');
  if (!(await db.adminUser.findUnique({ where: { id }, select: { id: true } }))) done('not-found');

  // Stamping passwordChangedAt is what signs out the sessions opened with the old one.
  await db.adminUser.update({
    where: { id },
    data: { passwordHash: hashPassword(password), passwordChangedAt: new Date(), active: true }
  });
  done('password-reset');
}

export async function setAdminAccountActive(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const active = text(formData, 'active') === 'true';

  const account = await db.adminUser.findUnique({ where: { id }, select: { id: true } });
  if (!account) done('not-found');

  if (!active) {
    /**
     * Two ways this button could lock the shop out of its own dashboard: by
     * turning off the account you are using, or by turning off the last one
     * that works when there is no shared ADMIN_PASSWORD left to fall back on.
     */
    const signedInAs = await currentAdmin();
    if (signedInAs?.id === id) done('self-deactivate');

    if (!process.env.ADMIN_PASSWORD) {
      const remaining = await db.adminUser.count({ where: { active: true, id: { not: id } } });
      if (remaining === 0) done('last-account');
    }
  }

  await db.adminUser.update({ where: { id }, data: { active } });
  done(active ? 'reactivated' : 'deactivated');
}
