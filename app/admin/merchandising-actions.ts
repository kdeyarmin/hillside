'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { HomepageSectionKind, MerchandisingMode } from '@prisma/client';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { adminMerchandisingPath } from '@/lib/admin-dashboard';
import { formInteger } from '@/lib/form-values';
import { homepageSectionNeedsCollection } from '@/lib/merchandising';
import { Prisma, ProductRelationKind } from '@prisma/client';
import { parseBundleInput } from '@/lib/bundle-form';
import {
  MAX_RELATIONS_PER_KIND,
  normalizeTag,
  RECOMMENDATION_SECTIONS
} from '@/lib/recommendations';

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

/**
 * Sets appear on their own page, in the header and in the sitemap, and a set is
 * only listed while its components are in stock — so saving one has to refresh
 * the pages that decide whether to show it at all, not only its own.
 */
function refreshBundlePages(slug?: string) {
  revalidatePath('/bundles');
  revalidatePath('/admin/merchandising');
  revalidatePath('/');
  revalidatePath('/shop');
  if (slug) revalidatePath(`/bundles/${slug}`);
}

export async function saveBundle(formData: FormData) {
  await guard();
  const parsed = parseBundleInput(formData);
  if (!parsed.ok) {
    redirect(
      adminMerchandisingPath({
        error: parsed.reason === 'no-items' ? 'bundle-empty' : 'bundle-invalid',
        section: parsed.id ? 'bundles' : 'add-bundle',
        item: parsed.id || undefined
      })
    );
  }

  /**
   * The recipe is replaced wholesale rather than diffed. `BundleItem` carries no
   * history — an order's components are snapshotted onto the order itself — so
   * there is nothing here that a delete could lose, and rewriting it in one
   * transaction is what stops a half-saved recipe from being visible to a
   * shopper mid-save.
   */
  let bundle: { id: string; slug: string };
  try {
    bundle = await db.$transaction(async (transaction) => {
      const saved = parsed.id
        ? await transaction.bundle.update({ where: { id: parsed.id }, data: parsed.data })
        : await transaction.bundle.create({ data: parsed.data });
      await transaction.bundleItem.deleteMany({ where: { bundleId: saved.id } });
      await transaction.bundleItem.createMany({
        data: parsed.items.map((item) => ({ ...item, bundleId: saved.id }))
      });
      return saved;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      redirect(
        adminMerchandisingPath({
          error: 'bundle-slug',
          section: parsed.id ? 'bundles' : 'add-bundle',
          item: parsed.id || undefined
        })
      );
    }
    // A product picked in the form and archived away in another tab.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      redirect(
        adminMerchandisingPath({
          error: 'bundle-product-missing',
          section: 'bundles',
          item: parsed.id || undefined
        })
      );
    }
    throw error;
  }

  refreshBundlePages(bundle.slug);
  redirect(
    adminMerchandisingPath({
      notice: parsed.id ? 'bundle-saved' : 'bundle-created',
      section: 'bundles',
      item: bundle.id
    })
  );
}

export async function setBundleActive(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const active = text(formData, 'active') === 'true';
  if (!id) redirect(adminMerchandisingPath({ error: 'bundle-missing', section: 'bundles' }));

  const bundle = await db.bundle.update({
    where: { id },
    data: active ? { active: true } : { active: false, featured: false },
    select: { slug: true }
  });
  refreshBundlePages(bundle.slug);
  redirect(
    adminMerchandisingPath({
      notice: active ? 'bundle-live' : 'bundle-archived',
      section: 'bundles',
      item: id
    })
  );
}

export async function deleteBundle(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  if (!id) redirect(adminMerchandisingPath({ error: 'bundle-missing', section: 'bundles' }));

  const bundle = await db.bundle.findUnique({ where: { id }, select: { slug: true } });
  if (!bundle) redirect(adminMerchandisingPath({ error: 'bundle-missing', section: 'bundles' }));

  /**
   * Orders that contain this set keep their line, their price and the components
   * they took off the shelf: `OrderItem.bundleId` is set to null rather than
   * cascading, because an order is a record of what was sold and must not change
   * when the shop stops selling it.
   */
  await db.bundle.delete({ where: { id } });
  refreshBundlePages(bundle.slug);
  redirect(adminMerchandisingPath({ notice: 'bundle-deleted', section: 'bundles' }));
}

/**
 * Replaces one product's recommendations for one section.
 *
 * Per section rather than all at once, because the three sections mean different
 * things and are edited on their own: saving "Pairs well with" must not clear
 * what somebody chose under "Complete the setup".
 */
export async function saveProductRelations(formData: FormData) {
  await guard();
  const productId = text(formData, 'productId');
  const rawKind = text(formData, 'kind');
  if (!productId || !Object.values(ProductRelationKind).includes(rawKind as ProductRelationKind)) {
    redirect(adminMerchandisingPath({ error: 'relation-invalid', section: 'cross-sell' }));
  }
  const kind = rawKind as ProductRelationKind;

  const chosen = formData
    .getAll('relatedProductId')
    .map((value) => String(value).trim())
    .filter(Boolean)
    // A product recommending itself is a loop, not a recommendation.
    .filter((relatedProductId) => relatedProductId !== productId);
  const unique = [...new Set(chosen)].slice(0, MAX_RELATIONS_PER_KIND);
  const notes = new Map(
    unique.map((relatedProductId) => [
      relatedProductId,
      text(formData, `note-${relatedProductId}`) || null
    ])
  );

  await db.$transaction(async (transaction) => {
    await transaction.productRelation.deleteMany({ where: { productId, kind } });
    if (!unique.length) return;
    await transaction.productRelation.createMany({
      data: unique.map((relatedProductId, index) => ({
        productId,
        relatedProductId,
        kind,
        note: notes.get(relatedProductId) ?? null,
        sortOrder: index
      }))
    });
  });

  const product = await db.product.findUnique({
    where: { id: productId },
    select: { slug: true }
  });
  revalidatePath('/admin/merchandising');
  if (product) revalidatePath(`/shop/${product.slug}`);
  redirect(
    adminMerchandisingPath({
      notice: 'relations-saved',
      section: 'cross-sell',
      item: productId,
      kind: RECOMMENDATION_SECTIONS.find((section) => section.kind === kind)?.kind
    })
  );
}

/** Replaces the products a care guide features, with the owner's own reasons. */
export async function saveCareGuideProducts(formData: FormData) {
  await guard();
  const careSheetId = text(formData, 'careSheetId');
  if (!careSheetId) {
    redirect(adminMerchandisingPath({ error: 'guide-missing', section: 'care-commerce' }));
  }

  const chosen = [
    ...new Set(
      formData
        .getAll('productId')
        .map((value) => String(value).trim())
        .filter(Boolean)
    )
  ].slice(0, MAX_RELATIONS_PER_KIND);

  await db.$transaction(async (transaction) => {
    await transaction.careGuideProduct.deleteMany({ where: { careSheetId } });
    if (!chosen.length) return;
    await transaction.careGuideProduct.createMany({
      data: chosen.map((productId, index) => ({
        careSheetId,
        productId,
        note: text(formData, `note-${productId}`) || null,
        sortOrder: index
      }))
    });
  });

  const guide = await db.careSheet.findUnique({
    where: { id: careSheetId },
    select: { slug: true }
  });
  revalidatePath('/admin/merchandising');
  revalidatePath('/care');
  if (guide) revalidatePath(`/care/${guide.slug}`);
  redirect(
    adminMerchandisingPath({
      notice: 'guide-products-saved',
      section: 'care-commerce',
      item: careSheetId
    })
  );
}

/**
 * The merchandising tags the automatic recommendation rules read — `terrarium`,
 * `carnivorous`, `planter`, `substrate`. Saved from this page rather than the
 * product form because they only exist for recommendations, and because a tag is
 * only useful once you can see the vocabulary the rest of the catalog uses.
 */
export async function saveProductTags(formData: FormData) {
  await guard();
  const productId = text(formData, 'productId');
  if (!productId) {
    redirect(adminMerchandisingPath({ error: 'relation-invalid', section: 'cross-sell' }));
  }

  /**
   * Normalized the way `productTraits` reads them, not merely lowercased: the
   * rules match on `terrarium-container`, so a tag saved as "terrarium
   * container" would have matched nothing at all.
   */
  const tags = [
    ...new Set(
      text(formData, 'tags')
        .split(/[\n,]+/)
        .map((tag) => normalizeTag(tag))
        .filter(Boolean)
    )
  ].slice(0, 12);

  const product = await db.product.update({
    where: { id: productId },
    data: { tags },
    select: { slug: true }
  });
  revalidatePath('/admin/merchandising');
  revalidatePath(`/shop/${product.slug}`);
  redirect(
    adminMerchandisingPath({ notice: 'tags-saved', section: 'cross-sell', item: productId })
  );
}
