'use server';

import { CareGuideType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin';
import { starterCareGuides } from '@/lib/care-seed-data';
import { db } from '@/lib/db';

const text = (form: FormData, name: string) => String(form.get(name) || '').trim();
const checked = (form: FormData, name: string) =>
  form.get(name) === 'on' || form.get(name) === 'true';
const integer = (form: FormData, name: string, fallback = 0) => {
  const value = Number(form.get(name));
  return Number.isFinite(value) ? Math.floor(value) : fallback;
};
const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

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
  const id = text(formData, 'id');
  const plantName = text(formData, 'plantName');
  const slug = slugify(text(formData, 'slug') || plantName);
  const rawType = text(formData, 'guideType');
  const guideType = Object.values(CareGuideType).includes(rawType as CareGuideType)
    ? (rawType as CareGuideType)
    : CareGuideType.PLANT;

  const data = {
    plantName,
    slug,
    guideType,
    category: text(formData, 'category') || null,
    difficulty: text(formData, 'difficulty') || null,
    botanical: text(formData, 'botanical') || null,
    summary: text(formData, 'summary'),
    light: text(formData, 'light'),
    water: text(formData, 'water'),
    humidity: text(formData, 'humidity'),
    soil: text(formData, 'soil'),
    feeding: text(formData, 'feeding'),
    temperature: text(formData, 'temperature'),
    petSafety: text(formData, 'petSafety') || null,
    tips: text(formData, 'tips'),
    symptoms: text(formData, 'symptoms') || null,
    causes: text(formData, 'causes') || null,
    treatment: text(formData, 'treatment') || null,
    prevention: text(formData, 'prevention') || null,
    checklist: text(formData, 'checklist') || null,
    imageUrl: text(formData, 'imageUrl') || null,
    featured: checked(formData, 'featured'),
    sortOrder: integer(formData, 'sortOrder'),
    published: checked(formData, 'published')
  };

  if (!plantName || !slug || !data.summary || !data.tips) return;
  if (id) await db.careSheet.update({ where: { id }, data });
  else await db.careSheet.create({ data });
  refresh(slug);
  redirect(`/admin/care?saved=${encodeURIComponent(slug)}`);
}

export async function setCareGuidePublished(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const published = checked(formData, 'published');
  if (!id) return;
  const guide = await db.careSheet.update({ where: { id }, data: { published } });
  refresh(guide.slug);
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
  redirect(`/admin/care?seeded=${starterCareGuides.length}`);
}
