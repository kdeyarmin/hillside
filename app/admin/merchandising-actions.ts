'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma, ProductRelationKind } from '@prisma/client';
import { isAdmin } from '@/lib/admin';
import { adminMerchandisingPath } from '@/lib/admin-dashboard';
import { parseBundleInput } from '@/lib/bundle-form';
import { db } from '@/lib/db';
import {
  MAX_RELATIONS_PER_KIND,
  normalizeTag,
  RECOMMENDATION_SECTIONS
} from '@/lib/recommendations';

const text = (form: FormData, name: string) => String(form.get(name) || '').trim();

async function guard() {
  if (!(await isAdmin())) redirect('/admin');
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
