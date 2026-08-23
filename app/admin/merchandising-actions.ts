'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { HomepageSectionKind, MerchandisingMode } from '@prisma/client';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { adminMerchandisingPath } from '@/lib/admin-dashboard';
import { formInteger } from '@/lib/form-values';
import { homepageSectionNeedsCollection } from '@/lib/merchandising';

/**
 * Everything on the merchandising page: the homepage rows, the order products
 * and collections appear in, and the per-product labels.
 *
 * These are separate from `actions.ts` because they are separate work — nothing
 * here touches stock, price or anything a customer has already paid for, which
 * is what makes it safe for Tammy to rearrange the shop without the caution the
 * product form needs.
 */

const text = (form: FormData, name: string) => String(form.get(name) || '').trim();
const checked = (form: FormData, name: string) =>
  form.get(name) === 'on' || form.get(name) === 'true';
// `formInteger`, not a local `Number()` guard: `Number('')` is 0 and 0 is
// finite, so a cleared "how many to show" box would store zero and step past the
// default beside the call. See lib/form-values.ts.
const integer = formInteger;

async function guard() {
  if (!(await isAdmin())) redirect('/admin');
}

/**
 * The public pages the merchandising touches. The homepage and shop are always
 * refreshed because every one of these changes is visible on both.
 */
function refresh(...paths: string[]) {
  for (const path of new Set(['/admin/merchandising', '/', '/shop', '/collections', ...paths])) {
    revalidatePath(path);
  }
}

function mode(value: string): MerchandisingMode {
  return Object.values(MerchandisingMode).includes(value as MerchandisingMode)
    ? (value as MerchandisingMode)
    : MerchandisingMode.AUTO;
}

/**
 * A posted `order` field back as ids. Anything not in `known` is dropped — a
 * stale form posted after a product was archived should reorder what is left
 * rather than fail, and an id that no longer exists would throw mid-update and
 * leave the shelf half-arranged.
 */
function orderedIds(form: FormData, known: Set<string>) {
  return text(form, 'order')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id && known.has(id));
}

export async function saveHomepageSection(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const rawKind = text(formData, 'kind');
  const kind = Object.values(HomepageSectionKind).includes(rawKind as HomepageSectionKind)
    ? (rawKind as HomepageSectionKind)
    : null;
  const title = text(formData, 'title');
  const collectionId = text(formData, 'collectionId') || null;

  if (!kind || !title || (homepageSectionNeedsCollection(kind) && !collectionId)) {
    redirect(adminMerchandisingPath({ error: 'section-invalid', section: 'homepage' }));
  }

  const data = {
    kind,
    title,
    eyebrow: text(formData, 'eyebrow') || null,
    subtitle: text(formData, 'subtitle') || null,
    // A row of one product looks like a mistake, and more than eight is a page
    // of its own rather than a homepage row.
    maxItems: Math.max(2, Math.min(8, integer(formData.get('maxItems'), 4))),
    collectionId: homepageSectionNeedsCollection(kind) ? collectionId : null,
    active: checked(formData, 'active')
  };

  if (id) {
    const existing = await db.homepageSection.findUnique({ where: { id }, select: { id: true } });
    if (!existing) redirect(adminMerchandisingPath({ error: 'section-missing' }));
    await db.homepageSection.update({ where: { id }, data });
  } else {
    const last = await db.homepageSection.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true }
    });
    await db.homepageSection.create({
      data: { ...data, sortOrder: (last?.sortOrder ?? 0) + 10 }
    });
  }

  refresh();
  redirect(
    adminMerchandisingPath({
      notice: id ? 'section-saved' : 'section-created',
      section: 'homepage'
    })
  );
}

export async function deleteHomepageSection(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  if (!id) redirect(adminMerchandisingPath({ error: 'section-missing' }));

  // Already gone is the outcome she wanted, so a double submit is not an error.
  await db.homepageSection.deleteMany({ where: { id } });
  refresh();
  redirect(adminMerchandisingPath({ notice: 'section-deleted', section: 'homepage' }));
}

export async function reorderHomepageSections(formData: FormData) {
  await guard();
  const sections = await db.homepageSection.findMany({ select: { id: true } });
  const ids = orderedIds(formData, new Set(sections.map((section) => section.id)));

  /**
   * Rewritten as a multiple of ten so a row inserted later has somewhere to go
   * without renumbering the whole page, and in one transaction so a failure
   * halfway through cannot leave the homepage in an order nobody chose.
   */
  await db.$transaction(
    ids.map((id, index) =>
      db.homepageSection.update({ where: { id }, data: { sortOrder: (index + 1) * 10 } })
    )
  );

  refresh();
  redirect(adminMerchandisingPath({ notice: 'sections-arranged', section: 'homepage' }));
}

export async function reorderProducts(formData: FormData) {
  await guard();
  const products = await db.product.findMany({ where: { active: true }, select: { id: true } });
  const ids = orderedIds(formData, new Set(products.map((product) => product.id)));

  await db.$transaction(
    ids.map((id, index) =>
      db.product.update({ where: { id }, data: { sortOrder: (index + 1) * 10 } })
    )
  );

  refresh();
  redirect(adminMerchandisingPath({ notice: 'products-arranged', section: 'order' }));
}

export async function reorderCollections(formData: FormData) {
  await guard();
  const collections = await db.collection.findMany({ select: { id: true } });
  const ids = orderedIds(formData, new Set(collections.map((collection) => collection.id)));

  await db.$transaction(
    ids.map((id, index) =>
      db.collection.update({ where: { id }, data: { sortOrder: (index + 1) * 10 } })
    )
  );

  refresh();
  redirect(adminMerchandisingPath({ notice: 'collections-arranged', section: 'collections' }));
}

/**
 * The labels on one product: featured, Tammy's pick, its badge, and whether the
 * automatic best-seller and new-arrival rules apply to it.
 *
 * Deliberately narrow. This form sits next to a table of products and posts
 * whichever row was changed, so it must never write price, stock or anything
 * else the product form owns — a merchandising save that clobbered an inventory
 * count from a stale table would be a genuinely expensive bug.
 */
export async function updateProductMerchandising(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const product = await db.product.findUnique({ where: { id }, select: { slug: true } });
  if (!product) redirect(adminMerchandisingPath({ error: 'merchandising-missing' }));

  await db.product.update({
    where: { id },
    data: {
      featured: checked(formData, 'featured'),
      staffPick: checked(formData, 'staffPick'),
      badge: text(formData, 'badge') || null,
      bestSellerMode: mode(text(formData, 'bestSellerMode')),
      newArrivalMode: mode(text(formData, 'newArrivalMode'))
    }
  });

  refresh(`/shop/${product.slug}`);
  redirect(
    adminMerchandisingPath({
      notice: 'merchandising-saved',
      section: 'labels',
      product: product.slug
    })
  );
}

/** Whether a collection is offered on the homepage's collection tiles. */
export async function updateCollectionFeature(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const collection = await db.collection.findUnique({ where: { id }, select: { slug: true } });
  if (!collection) redirect(adminMerchandisingPath({ error: 'collection-missing' }));

  await db.collection.update({
    where: { id },
    data: { featured: checked(formData, 'featured'), active: checked(formData, 'active') }
  });

  refresh(`/collections/${collection.slug}`);
  redirect(adminMerchandisingPath({ notice: 'merchandising-saved', section: 'collections' }));
}
