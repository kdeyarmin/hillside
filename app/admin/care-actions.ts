'use server';

import { CareGuideType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin';
import { starterCareGuides } from '@/lib/care-seed-data';
import { adminCarePath, parseCareGuideInput } from '@/lib/care-form';
import { db } from '@/lib/db';

const text = (form: FormData, name: string) => String(form.get(name) || '').trim();
const checked = (form: FormData, name: string) =>
  form.get(name) === 'on' || form.get(name) === 'true';

async function guard() {
  if (!(await isAdmin())) redirect('/admin');
}

function refresh(slug?: string) {
  revalidatePath('/care');
  revalidatePath('/admin/care');
  revalidatePath('/admin/content');
  if (slug) revalidatePath(`/care/${slug}`);
}

export async function saveCareGuide(formData: FormData) {
  await guard();
  const parsed = parseCareGuideInput(formData);
  if (!parsed.ok) {
    redirect(
      adminCarePath({
        error: 'required',
        edit: parsed.slug || undefined,
        item: parsed.id || undefined
      })
    );
  }

  const data = {
    ...parsed.data,
    guideType: parsed.data.guideType as CareGuideType
  };

  if (parsed.id) await db.careSheet.update({ where: { id: parsed.id }, data });
  else await db.careSheet.create({ data });
  refresh(data.slug);
  redirect(adminCarePath({ saved: data.slug }));
}

export async function setCareGuidePublished(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const published = checked(formData, 'published');
  if (!id) redirect(adminCarePath());
  const guide = await db.careSheet.update({ where: { id }, data: { published } });
  refresh(guide.slug);
  redirect(adminCarePath({ edit: guide.slug, notice: published ? 'published' : 'draft' }));
}

export async function seedStarterCareLibrary() {
  await guard();
  for (const guide of starterCareGuides) {
    await db.careSheet.upsert({
      where: { slug: guide.slug },
      update: guide,
      create: guide
    });
  }
  refresh();
  redirect(adminCarePath({ seeded: String(starterCareGuides.length) }));
}
