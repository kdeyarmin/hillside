'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ClassFormat,
  InventoryStatus,
  MessageStatus,
  OrderStatus,
  ProductSpecKind,
  ProductType,
  RegistrationStatus,
  ReviewStatus
} from '@prisma/client';
import { authenticateAdmin, clearAdminSession, isAdmin, setAdminSession } from '@/lib/admin';
import { Prisma } from '@prisma/client';
import { clientKeyFromHeaders, rateLimitedByKey } from '@/lib/rate-limit';
import { createClassJoinCredential, isOnlineClass } from '@/lib/class-access';
import { sendClassRegistrationEmails } from '@/lib/class-registration-email';
import { db } from '@/lib/db';
import { formInteger } from '@/lib/form-values';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { ensureTelnyxRoom, telnyxVideoConfigured } from '@/lib/telnyx-video';
import { notifyStockAlerts } from '@/lib/stock-alerts';
import { releaseProductHold, restoreUnshippedOrderInventory } from '@/lib/checkout';
import { refundOrderGiftCard } from '@/lib/discount-store';
import { adminContentPath, adminDashboardPath, uniqueConstraintField } from '@/lib/admin-dashboard';
import {
  productInventoryForSizes,
  readStoredSizes,
  readVariantRows,
  returnStoredSizeStock,
  sizeFieldLabel,
  storedSizesTrackStock,
  withoutRedundantPrices
} from '@/lib/product-sizes';
import { nextRestockedAt, parseRestockDate } from '@/lib/inventory';
import { publishBlockReason } from '@/lib/product-completeness';
import { mergeProductSpecs, productSpecsFromForm } from '@/lib/product-specs';
import { SPEC_KIND_BY_TYPE } from '@/lib/product-categories';
import { amazonPickDraft, DEFAULT_PICK_TITLE, extractAsin, isAmazonLink } from '@/lib/amazon-pick';
import { normalizeTags } from '@/lib/product-tags';
import { parseFaqLines, parseKeywords } from '@/lib/category-content';
import { associateTag, lookupAmazonProduct } from '@/lib/amazon-lookup';
import { sendOrderConfirmationEmail } from '@/lib/order-send';
import { nextFulfilledAt } from '@/lib/orders';
import { isPickupOrder } from '@/lib/fulfillment';
import { sanitizePublicHref } from '@/lib/public-href';
import { absoluteUrl } from '@/lib/store';

const text = (form: FormData, name: string) => String(form.get(name) || '').trim();
const checked = (form: FormData, name: string) =>
  form.get(name) === 'on' || form.get(name) === 'true';
const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
/** Prefer the typed slug, but if it is only punctuation fall back to the name. */
const slugFrom = (preferred: string, fallback: string) => slugify(preferred) || slugify(fallback);
const money = (value: FormDataEntryValue | null) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
};
/**
 * `formInteger` rather than a local `Number()` guard: an absent or empty field
 * reads as `0` through `Number`, which is finite, so every fallback beside a
 * call below used to be unreachable. See lib/form-values.ts.
 */
const integer = formInteger;
/**
 * A whole number, or nothing at all — which is why this cannot simply be
 * `formInteger`: that always answers with a number, and a reorder point has to
 * be able to be unset. "0" is a legitimate reorder point, meaning reorder when
 * the last one goes, so a blank box cannot be allowed to fall through to zero
 * and quietly enrol the product in a reorder list nobody asked for.
 */
const optionalInteger = (value: FormDataEntryValue | null, max = 1_000_000) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.min(max, Math.floor(number));
};
/** A posted select value, checked against the enum it claims to be. */
const enumValue = <T extends string, F extends T | null>(
  raw: string,
  values: Record<string, T>,
  fallback: F
) => ((Object.values(values) as string[]).includes(raw) ? (raw as T) : fallback) as T | F;
const optionalDate = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

async function guard() {
  if (!(await isAdmin())) redirect('/admin');
}

function refresh(...paths: string[]) {
  for (const path of new Set(['/admin', ...paths])) revalidatePath(path);
}

/**
 * This login protects every order, every customer address, the whole
 * subscriber list and the CSV exports of all three. It previously had no
 * throttle at all — unlimited guesses, as fast as they could be posted — and
 * compared with `!==`, which short-circuits on the first differing byte and so
 * leaks the length and prefix of the real password through response timing.
 *
 * Both comparisons behind `authenticateAdmin` are constant-time, and the
 * failure below is deliberately identical whether the email is unknown or the
 * password is wrong: telling the two apart would confirm which addresses have
 * accounts.
 */
export async function loginAdmin(formData: FormData) {
  const email = text(formData, 'email');
  const password = text(formData, 'password');
  const requestHeaders = await headers();
  const identity = clientKeyFromHeaders(requestHeaders);

  if (rateLimitedByKey(identity, { name: 'admin-login', limit: 8, windowMs: 15 * 60_000 })) {
    redirect('/admin?error=throttled');
  }

  const account = await authenticateAdmin(email, password);
  if (!account) {
    redirect('/admin?error=1');
  }
  await setAdminSession(account.subject, account.passwordVersion);
  redirect('/admin');
}

export async function logoutAdmin() {
  await clearAdminSession();
  redirect('/admin');
}

/** The owner's editor for one product, or for a product that does not exist yet. */
function adminProductPath(id: string, query: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const encoded = params.toString();
  return `/admin/products/${id}${encoded ? `?${encoded}` : ''}`;
}

/**
 * The category a product was filed under, or null. Every structural decision on
 * the form hangs off this one answer: which detail fields are asked for, and
 * which legacy `ProductType` the row is recorded as.
 */
async function chosenCategory(categoryId: string) {
  if (!categoryId) return null;
  return db.category.findUnique({
    where: { id: categoryId },
    select: { id: true, specKind: true, legacyType: true }
  });
}

export async function saveProduct(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const name = text(formData, 'name');
  const slug = slugFrom(text(formData, 'slug'), name);
  const category = await chosenCategory(text(formData, 'categoryId'));
  const rawType = text(formData, 'type');
  /**
   * `type` is no longer typed in: the category says which of the six legacy
   * values a product is recorded as, so the two cannot drift apart and start
   * disagreeing about whether a flytrap is a plant. The posted value is only a
   * fallback for the moment before the category table has been seeded, and for
   * a product deliberately left uncategorised.
   */
  const type = category
    ? category.legacyType
    : Object.values(ProductType).includes(rawType as ProductType)
      ? (rawType as ProductType)
      : ProductType.OTHER;
  const specKind: ProductSpecKind = category?.specKind ?? SPEC_KIND_BY_TYPE[type] ?? 'GENERAL';
  const priceCents = money(formData.get('price'));
  const compareAtText = text(formData, 'compareAt');
  const ships = checked(formData, 'ships');
  const pickup = checked(formData, 'pickup');
  /**
   * Neither box ticked would list something nobody can receive, so an empty
   * answer is read as "both" — the same reading the shop has always had, moved
   * up here because the variants below resolve against these two flags.
   */
  const productShips = !ships && !pickup ? true : ships;
  const productPickup = !ships && !pickup ? true : pickup;
  const productSku = text(formData, 'sku') || null;
  const productImageUrl = text(formData, 'imageUrl') || null;
  const weightOunces = Math.max(0, integer(formData.get('weightOunces')));
  const productDimensions = text(formData, 'dimensions').slice(0, 80) || null;

  /**
   * Variants are stored only when the owner listed some. No rows filled in
   * means the product is sold one way, and `DbNull` says that plainly — an
   * empty array would read as "there is a variant list, and it is empty".
   *
   * Anything a variant merely repeats from the product — its price, its
   * photograph, its shipping answer — is dropped rather than stored, so the
   * variant goes on following the product the way the form promises it will.
   */
  const sizes = withoutRedundantPrices(readVariantRows(formData), priceCents, {
    sku: productSku,
    imageUrl: productImageUrl,
    weightOunces: weightOunces || null,
    dimensions: productDimensions,
    ships: productShips,
    pickup: productPickup
  });
  const sizeLabelText = text(formData, 'sizeLabel');

  /**
   * Only the fields this category actually asks for are read, and they are laid
   * over whatever the product already had rather than replacing it. Re-shelving
   * a lotion as apothecary and back should not quietly erase its ingredient
   * list.
   */
  const previous = id
    ? await db.product.findUnique({
        where: { id },
        select: { inventory: true, slug: true, specs: true, lastRestockedAt: true }
      })
    : null;
  const specs = mergeProductSpecs(
    previous?.specs,
    productSpecsFromForm(formData, specKind),
    specKind
  );

  const data = {
    name,
    slug,
    sku: productSku,
    shortDescription: text(formData, 'shortDescription') || null,
    description: text(formData, 'description'),
    details: text(formData, 'details') || null,
    careNotes: text(formData, 'careNotes') || null,
    shippingNote: text(formData, 'shippingNote') || null,
    ships: productShips,
    pickup: productPickup,
    type,
    categoryId: category?.id ?? null,
    priceCents,
    compareAtCents: compareAtText ? money(formData.get('compareAt')) : null,
    imageUrl: productImageUrl,
    lifestyleImageUrl: text(formData, 'lifestyleImageUrl') || null,
    detailImageUrl: text(formData, 'detailImageUrl') || null,
    scaleImageUrl: text(formData, 'scaleImageUrl') || null,
    packagingImageUrl: text(formData, 'packagingImageUrl') || null,
    badge: text(formData, 'badge') || null,
    sizes: sizes.length ? (sizes as Prisma.InputJsonValue) : Prisma.DbNull,
    // Only meaningful alongside a variant list, and only when the owner renamed it.
    sizeLabel: sizes.length && sizeLabelText ? sizeFieldLabel(sizeLabelText) : null,
    specs: Object.keys(specs).length ? (specs as Prisma.InputJsonValue) : Prisma.DbNull,
    weightOunces: weightOunces > 0 ? weightOunces : null,
    dimensions: productDimensions,
    active: checked(formData, 'active'),
    featured: checked(formData, 'featured'),
    staffPick: checked(formData, 'staffPick'),
    botanical: text(formData, 'botanical') || null,
    searchTerms: text(formData, 'searchTerms') || null,
    /**
     * Only attributes the tag catalog knows about *and* that apply to this
     * product's type are stored. A posted value outside the catalog is a stale
     * form or a hand-crafted request; one that is simply wrong for the type —
     * "low light" on a bar of soap — is a slip on a form that shows every group
     * whatever is being edited, and either would put a product behind a filter
     * that can never describe it.
     */
    tags: normalizeTags(
      formData.getAll('tags').map((value) => String(value)),
      type
    ),
    seasonStartsAt: optionalDate(text(formData, 'seasonStartsAt')),
    seasonEndsAt: optionalDate(text(formData, 'seasonEndsAt')),
    sortOrder: integer(formData.get('sortOrder')),
    supplier: text(formData, 'supplier') || null,
    supplierItemNumber: text(formData, 'supplierItemNumber') || null,
    reorderPoint: optionalInteger(formData.get('reorderPoint')),
    reorderQuantity: optionalInteger(formData.get('reorderQuantity')),
    inventoryNotes: text(formData, 'inventoryNotes') || null,
    inventoryStatus: enumValue(
      text(formData, 'inventoryStatus'),
      InventoryStatus,
      InventoryStatus.STOCKED
    ),
    galleryImages: text(formData, 'galleryImages')
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 8)
  };

  /**
   * Every failure below lands back on the form it came from. The product form
   * lives on a page of its own — `new` for one that does not exist yet — and
   * sending the owner to a dashboard carrying an error about a form she cannot
   * see there is how a failed save reads as a save.
   */
  const editorPath = (error: string) => adminProductPath(id || 'new', { error });

  /**
   * The one completeness rule that refuses rather than advises.
   *
   * Everything else the dashboard checks is a nudge — an incomplete draft is how
   * the work gets done, and being stopped at the save button is how it stops.
   * But a tea or a lotion with no net contents and no ingredient list is not
   * ours to put on sale, so it saves in full and stays a draft, with the reason
   * on screen. Nothing she typed is lost either way.
   */
  const publishBlocked = data.active && Boolean(publishBlockReason(data));
  if (publishBlocked) data.active = false;

  if (!name || !slug || !data.description || priceCents < 0) {
    redirect(editorPath('product-invalid'));
  }

  /**
   * A category is required whenever the form offered one, which the presence of
   * the field is exactly the signal for: a database whose taxonomy has not been
   * seeded yet renders the older product-type dropdown instead and posts no
   * `categoryId` at all. The browser enforces this too; this is the half that
   * cannot be skipped, and it matters because a product with no category is
   * asked for the wrong details and drops out of every filter that leads to it.
   */
  if (!category && formData.has('categoryId')) {
    redirect(editorPath('category-required'));
  }

  /**
   * A product whose variants carry their own counts has no separate quantity to
   * type: the column is the sum of them, and taking it from the variant rows is
   * what keeps the two from drifting. The quantity box still answers for a
   * product sold one way, or sold in variants off one shelf.
   */
  const tracksSizeStock = storedSizesTrackStock(sizes);
  const postedInventory = productInventoryForSizes(
    sizes,
    Math.max(0, integer(formData.get('inventory')))
  );
  const expectedInventory = integer(formData.get('expectedInventory'), postedInventory);

  const collectionIds = formData
    .getAll('collectionIds')
    .map((value) => String(value))
    .filter(Boolean);

  /**
   * A restock dates itself. The owner's own date wins when she sets one, and
   * otherwise a quantity that went *up* stamps today — which is the difference
   * between a field that stays current and one field too many to remember.
   *
   * "Went up" is measured against `expectedInventory`, the figure this form was
   * rendered with, not against the row as it stands now. A checkout hold landing
   * while the form sat open lowers the row, so comparing against it would read
   * an *unchanged* form as a rise and stamp a restock that never happened —
   * on the very save path that deliberately leaves the quantity alone.
   *
   * A product being created has no earlier figure to have risen from, and its
   * opening count is stock arriving, so it stamps.
   */
  const record = {
    ...data,
    lastRestockedAt: nextRestockedAt({
      typed: parseRestockDate(text(formData, 'lastRestockedAt')),
      stored: previous?.lastRestockedAt ?? null,
      previousInventory: id ? expectedInventory : 0,
      nextInventory: postedInventory
    })
  };

  let product;
  try {
    if (!id) {
      product = await db.product.create({
        data: {
          ...record,
          inventory: postedInventory,
          collections: { connect: collectionIds.map((collectionId) => ({ id: collectionId })) }
        }
      });
    } else if (postedInventory === expectedInventory && !tracksSizeStock) {
      /**
       * The owner did not change the quantity box. Leave the column alone so a
       * checkout hold that landed while this form was open is not written back
       * over with the stale on-hand figure.
       *
       * Counted sizes never take this path, even when the total happens to
       * match. Their counts live in `sizes`, which this save rewrites either
       * way, so a hold that landed while the form was open has to be caught by
       * the claim below — leaving the column alone would keep the hold's
       * decrement on the product while putting the pre-hold count back on the
       * size, and the two would stop adding up.
       */
      product = await db.product.update({
        where: { id },
        data: {
          ...record,
          collections: { set: collectionIds.map((collectionId) => ({ id: collectionId })) }
        }
      });
    } else {
      /**
       * The claim and the write have to be one transaction, because the write
       * carries `sizes` and `sizes` now carries stock. As two autocommit
       * statements the row lock the claim takes is gone the moment it commits,
       * and a hold landing in the gap decrements both the total and the size it
       * was for — after which this write puts the form's pre-hold counts back on
       * the sizes while leaving the newer total alone. The two stop adding up,
       * and the next stock movement rebuilds the total from the stale counts and
       * sells the held stock a second time. Held across both writes, the lock
       * makes the hold wait and the claim fail, which is what the error below is
       * for.
       */
      const saved = await db.$transaction(async (transaction) => {
        const claimed = await transaction.product.updateMany({
          where: { id, inventory: expectedInventory },
          data: { inventory: postedInventory }
        });
        if (claimed.count === 0) return null;
        return transaction.product.update({
          where: { id },
          data: {
            ...record,
            collections: { set: collectionIds.map((collectionId) => ({ id: collectionId })) }
          }
        });
      });
      // Outside the transaction: `redirect` throws, and rolling the claim back
      // through that throw would depend on how Prisma re-raises it.
      if (!saved) {
        redirect(editorPath('inventory'));
      }
      product = saved;
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const field = uniqueConstraintField(error.meta?.target);
      redirect(editorPath(field === 'sku' ? 'sku' : 'slug'));
    }
    throw error;
  }

  /**
   * Only the zero-to-positive transition emails the waiting list. Firing on
   * every in-stock save turned a typo fix into a second wave of "it's back"
   * mail for anyone whose first notice had not been marked delivered.
   */
  if ((previous?.inventory ?? 0) <= 0 && product.inventory > 0) {
    await notifyStockAlerts(product.id, product.name, product.slug);
  }

  refresh('/shop', '/', '/collections', `/shop/${slug}`);
  // Back to the product: a created one is then open and ready to be finished,
  // and a saved one shows what was saved. Everything was saved either way; a
  // publish block only explains why it is not live.
  redirect(
    adminProductPath(product.id, {
      notice: publishBlocked ? undefined : id ? 'product-saved' : 'product-created',
      error: publishBlocked ? 'publish-blocked' : undefined
    })
  );
}

/**
 * Adding a delivery to the shelf, without opening the whole product form.
 *
 * This is the single most repeated thing Tammy does — a box arrives, six more
 * are on the bench — and doing it through the product editor meant reading the
 * current number, adding to it in her head, and typing the sum. Here she types
 * what arrived.
 */
export async function receiveStock(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  if (!id) redirect(adminDashboardPath({ section: 'inventory' }));

  const quantity = optionalInteger(formData.get('quantity'), 100_000);
  if (!quantity || quantity < 1) {
    redirect(adminDashboardPath({ error: 'restock-invalid', section: 'inventory' }));
  }
  const size = text(formData, 'size');

  const before = await db.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      inventory: true,
      sizes: true,
      inventoryStatus: true
    }
  });
  if (!before) redirect(adminDashboardPath({ error: 'product-missing', section: 'inventory' }));

  const stored = readStoredSizes(before.sizes);
  const perSize = storedSizesTrackStock(stored);

  /**
   * On a product counted per size the delivery has to land on one of them, and
   * the product total is then rebuilt from the sizes — writing the total alone
   * would leave it disagreeing with the counts underneath it, which is the one
   * thing `lib/product-sizes.ts` exists to prevent.
   */
  const nextSizes = perSize ? returnStoredSizeStock(stored, size, quantity) : stored;
  if (perSize && nextSizes === stored) {
    redirect(
      adminDashboardPath({ error: 'restock-invalid', product: before.slug, section: 'inventory' })
    );
  }
  const nextInventory = perSize
    ? productInventoryForSizes(nextSizes, before.inventory)
    : before.inventory + quantity;

  /**
   * Claimed on the quantity we read, so a checkout hold that lands in between
   * cannot be overwritten — the same guard the product form uses, and the same
   * "refresh and try again" answer when it fires.
   */
  const claimed = await db.product.updateMany({
    where: { id, inventory: before.inventory },
    data: {
      inventory: nextInventory,
      lastRestockedAt: new Date(),
      /**
       * The delivery landing is what ends "on order". Left set, the status would
       * keep the product off the reorder list for good — `needsReorder` excludes
       * ON_ORDER precisely so a placed order stops nagging — and this very stock
       * could sell back down below the reorder point without it ever reappearing
       * on the list Tammy works from. Every other status describes the product
       * rather than an outstanding order, so none of them is touched.
       */
      ...(before.inventoryStatus === InventoryStatus.ON_ORDER
        ? { inventoryStatus: InventoryStatus.STOCKED }
        : {}),
      ...(perSize ? { sizes: nextSizes as Prisma.InputJsonValue } : {})
    }
  });
  if (claimed.count === 0) {
    redirect(
      adminDashboardPath({ error: 'inventory', product: before.slug, section: 'inventory' })
    );
  }

  if (before.inventory <= 0 && nextInventory > 0) {
    await notifyStockAlerts(before.id, before.name, before.slug);
  }

  refresh('/shop', '/', '/collections', `/shop/${before.slug}`);
  redirect(
    adminDashboardPath({ notice: 'stock-received', product: before.slug, section: 'inventory' })
  );
}

export async function saveCollection(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const title = text(formData, 'title');
  const requestedSlug = slugFrom(text(formData, 'slug'), title);
  if (!title || !requestedSlug) {
    redirect(
      adminContentPath({
        error: 'collection-invalid',
        section: id ? 'collections' : 'add-collection',
        item: id || undefined
      })
    );
  }

  /**
   * Every collection is the owner's to rename, hide or delete. Three of them
   * used to be locked because the site header linked straight at them; the
   * header navigates by category now, so a collection is purely curatorial and
   * nothing structural breaks when one is retired.
   */
  /**
   * The FAQ is stored as JSON rather than as the typed lines, so the page and
   * the FAQPage markup both read one shape. An empty box clears it with
   * `DbNull` rather than an empty array — the difference matters to the page,
   * which publishes no FAQ schema at all when there are no questions.
   */
  const faq = parseFaqLines(text(formData, 'faq'));
  const careSheetIds = formData
    .getAll('careSheetIds')
    .map((value) => String(value))
    .filter(Boolean);

  const data = {
    title,
    slug: requestedSlug,
    tagline: text(formData, 'tagline') || null,
    description: text(formData, 'description') || null,
    imageUrl: text(formData, 'imageUrl') || null,
    featured: checked(formData, 'featured'),
    active: checked(formData, 'active'),
    sortOrder: integer(formData.get('sortOrder')),
    intro: text(formData, 'intro') || null,
    body: text(formData, 'body') || null,
    faq: faq.length ? (faq as Prisma.InputJsonValue) : Prisma.DbNull,
    metaTitle: text(formData, 'metaTitle') || null,
    metaDescription: text(formData, 'metaDescription') || null,
    keywords: parseKeywords(text(formData, 'keywords'))
  };

  const careSheets = { set: careSheetIds.map((sheetId) => ({ id: sheetId })) };
  const collection = id
    ? await db.collection.update({ where: { id }, data: { ...data, careSheets } })
    : await db.collection.create({ data: { ...data, careSheets: { connect: careSheets.set } } });
  refresh('/', '/collections', `/collections/${requestedSlug}`, '/shop');
  redirect(
    adminContentPath({
      notice: id ? 'collection-saved' : 'collection-created',
      section: 'collections',
      item: collection.id
    })
  );
}

export async function deleteCollection(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  if (!id) {
    redirect(adminContentPath({ error: 'collection-missing', section: 'collections' }));
  }

  const collection = await db.collection.findUnique({ where: { id } });
  if (!collection) {
    redirect(adminContentPath({ error: 'collection-missing', section: 'collections' }));
  }
  await db.collection.delete({ where: { id } });
  refresh('/', '/collections', '/shop');
  redirect(adminContentPath({ notice: 'collection-deleted', section: 'collections' }));
}

export async function updateReview(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const rawStatus = text(formData, 'status');
  const status = Object.values(ReviewStatus).includes(rawStatus as ReviewStatus)
    ? (rawStatus as ReviewStatus)
    : ReviewStatus.PENDING;
  if (!id) return;

  const review = await db.review.update({
    where: { id },
    data: {
      status,
      ownerReply: text(formData, 'ownerReply') || null,
      verifiedPurchase: checked(formData, 'verifiedPurchase')
    },
    include: { product: { select: { slug: true } } }
  });
  refresh('/shop', `/shop/${review.product.slug}`);
  redirect(adminDashboardPath({ notice: 'review-saved', review: id, section: 'reviews' }));
}

export async function archiveProduct(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  if (!id) return;
  const product = await db.product.update({
    where: { id },
    data: { active: false, featured: false },
    select: { slug: true }
  });
  refresh('/shop', '/');
  redirect(
    adminDashboardPath({ notice: 'product-archived', product: product.slug, section: 'inventory' })
  );
}

export async function setProductActive(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const active = text(formData, 'active') === 'true';
  if (!id) return;

  /**
   * The same refusal the save path applies, checked again here because this is
   * the other door into the shop: "Put back in shop" would otherwise list a tea
   * with no ingredients on it in one click.
   */
  if (active) {
    const candidate = await db.product.findUnique({
      where: { id },
      select: { slug: true, type: true, specs: true }
    });
    if (candidate && publishBlockReason(candidate)) {
      redirect(
        adminDashboardPath({
          error: 'publish-blocked',
          product: candidate.slug,
          section: 'inventory'
        })
      );
    }
  }

  const product = await db.product.update({
    where: { id },
    data: active ? { active: true } : { active: false, featured: false },
    select: { slug: true }
  });
  refresh('/shop', '/', '/collections', `/shop/${product.slug}`);
  redirect(
    adminDashboardPath({
      notice: active ? 'product-live' : 'product-archived',
      product: product.slug,
      section: 'inventory'
    })
  );
}

export async function updateOrder(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const rawStatus = text(formData, 'status');
  if (!id) return;
  if (!Object.values(OrderStatus).includes(rawStatus as OrderStatus)) {
    redirect(adminDashboardPath({ error: 'order-status', order: id, section: 'orders' }));
  }
  const status = rawStatus as OrderStatus;

  const before = await db.order.findUnique({ where: { id } });
  if (!before) return;
  const trackingCarrier = text(formData, 'trackingCarrier') || null;
  const trackingNumber = text(formData, 'trackingNumber') || null;
  const internalNotes = text(formData, 'internalNotes') || null;
  const pickupNote = text(formData, 'pickupNote');

  if (
    status === OrderStatus.FULFILLED &&
    before.status !== OrderStatus.FULFILLED &&
    isPickupOrder(before) &&
    !pickupNote
  ) {
    redirect(adminDashboardPath({ error: 'pickup-note', order: before.id, section: 'orders' }));
  }

  if (status === OrderStatus.CANCELLED && before.status === OrderStatus.PENDING) {
    const released = await releaseProductHold(id);
    if (!released) {
      redirect(adminDashboardPath({ error: 'order-already-paid', order: id, section: 'orders' }));
    }
    await db.order.update({
      where: { id },
      data: {
        trackingCarrier,
        trackingNumber,
        internalNotes,
        pickupNote: pickupNote || before.pickupNote
      }
    });
    refresh('/order-status');
    redirect(adminDashboardPath({ notice: 'order-saved', order: id, section: 'orders' }));
    return;
  }

  const savedPickupNote = pickupNote || before.pickupNote || null;

  const order = await db.order.update({
    where: { id },
    data: {
      status,
      trackingCarrier,
      trackingNumber,
      internalNotes,
      pickupNote: savedPickupNote,
      fulfilledAt: nextFulfilledAt(before, status)
    }
  });

  if (status === OrderStatus.REFUNDED) {
    await restoreUnshippedOrderInventory(order.id);
  }

  if (status === OrderStatus.CANCELLED && before.status !== OrderStatus.PENDING) {
    await restoreUnshippedOrderInventory(order.id);
  }

  /**
   * Whatever this order was paid for with a gift card goes back on the card.
   * Stripe refunds only the money it took, so nothing else would return it —
   * and unlike stock, a balance is not something that has already left the
   * bench, so it comes back whether or not the order shipped. Marking the same
   * order refunded twice credits the card once: the ledger is keyed on it.
   */
  if (status === OrderStatus.REFUNDED || status === OrderStatus.CANCELLED) {
    await refundOrderGiftCard(
      order.id,
      `Order ${order.invoiceNumber} was ${status.toLowerCase()}.`
    );
  }

  if (status === OrderStatus.FULFILLED && before.status !== OrderStatus.FULFILLED && order.email) {
    const pickup = isPickupOrder(order);
    const tracking =
      !pickup && trackingNumber
        ? `<p><strong>Tracking:</strong> ${escapeHtml(trackingCarrier || 'Carrier')} ${escapeHtml(trackingNumber)}</p>`
        : '';
    const statusUrl = absoluteUrl('/order-status');
    const body = pickup
      ? pickupReadyHtml(order.customerName, order.invoiceNumber, savedPickupNote || pickupNote)
      : `<p>Hi ${escapeHtml(order.customerName)},</p><p>We have marked order <strong>${escapeHtml(order.invoiceNumber)}</strong> as shipped.</p>${tracking}<p>Look this order up any time with your HG number and checkout email: <a href="${escapeHtml(statusUrl)}">${escapeHtml(statusUrl)}</a></p>`;
    const delivery = await sendEmail({
      to: order.email,
      kind: pickup ? 'PICKUP_READY' : 'SHIPPING_UPDATE',
      subject: pickup
        ? `Your Hillside order ${order.invoiceNumber} is ready for pickup`
        : `Your Hillside order ${order.invoiceNumber} has shipped`,
      idempotencyKey: pickup
        ? `pickup-ready/${order.id}`
        : `shipping-update/${order.id}/${trackingNumber || 'fulfilled'}`,
      html: emailShell(pickup ? 'Your order is ready for pickup' : 'Your order is on the way', body)
    });
    if (pickup && !delivery.sent) {
      redirect(
        adminDashboardPath({ error: 'pickup-email-failed', order: order.id, section: 'orders' })
      );
    }
  }

  refresh('/order-status');
  redirect(adminDashboardPath({ notice: 'order-saved', order: order.id, section: 'orders' }));
}

function pickupReadyHtml(customerName: string, invoiceNumber: string, pickupNote: string) {
  return `<p>Hi ${escapeHtml(customerName)},</p><p>Order <strong>${escapeHtml(invoiceNumber)}</strong> is ready for pickup in Ebensburg.</p><p><strong>Pickup window:</strong></p><p style="white-space:pre-line">${escapeHtml(pickupNote)}</p><p>Please come during that window. Reply to this email if you need to change it.</p>`;
}

export async function resendPickupReady(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  if (!id) redirect(adminDashboardPath({ error: 'order-missing', section: 'orders' }));

  const order = await db.order.findUnique({ where: { id } });
  if (!order) redirect(adminDashboardPath({ error: 'order-missing', section: 'orders' }));
  if (!isPickupOrder(order)) {
    redirect(adminDashboardPath({ error: 'order-not-confirmable', order: id, section: 'orders' }));
  }
  const pickupNote = text(formData, 'pickupNote') || order.pickupNote || '';
  if (!pickupNote) {
    redirect(adminDashboardPath({ error: 'pickup-note', order: id, section: 'orders' }));
  }
  if (!order.email) {
    redirect(adminDashboardPath({ error: 'order-no-email', order: id, section: 'orders' }));
  }

  if (pickupNote !== order.pickupNote) {
    await db.order.update({ where: { id }, data: { pickupNote } });
  }

  const delivery = await sendEmail({
    to: order.email,
    kind: 'PICKUP_READY',
    subject: `Your Hillside order ${order.invoiceNumber} is ready for pickup`,
    idempotencyKey: `pickup-ready/${order.id}/${Date.now()}`,
    html: emailShell(
      'Your order is ready for pickup',
      pickupReadyHtml(order.customerName, order.invoiceNumber, pickupNote)
    )
  });
  if (!delivery.sent) {
    redirect(adminDashboardPath({ error: 'pickup-email-failed', order: id, section: 'orders' }));
  }
  refresh('/order-status');
  redirect(adminDashboardPath({ notice: 'order-saved', order: id, section: 'orders' }));
}

export async function resendOrderConfirmation(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  if (!id) redirect(adminDashboardPath({ error: 'order-missing', section: 'orders' }));

  const result = await sendOrderConfirmationEmail(id, { force: true });
  const error = result.sent
    ? undefined
    : result.reason === 'missing'
      ? 'order-missing'
      : result.reason === 'not-confirmable'
        ? 'order-not-confirmable'
        : result.reason === 'no-email'
          ? 'order-no-email'
          : 'order-email-failed';
  redirect(
    adminDashboardPath({
      notice: result.sent ? 'order-emailed' : undefined,
      error,
      order: id,
      section: 'orders'
    })
  );
}

export async function saveClassEvent(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const title = text(formData, 'title');
  const slug = slugFrom(text(formData, 'slug'), title) || null;
  const startsAt = optionalDate(text(formData, 'startsAt'));
  const rawFormat = text(formData, 'format');
  const format = Object.values(ClassFormat).includes(rawFormat as ClassFormat)
    ? (rawFormat as ClassFormat)
    : ClassFormat.IN_PERSON;
  if (!title || !startsAt) {
    redirect(
      adminContentPath({
        error: 'content-invalid',
        section: id ? 'classes' : 'add-class',
        item: id || undefined
      })
    );
  }

  const data = {
    title,
    slug,
    description: text(formData, 'description'),
    startsAt,
    location:
      text(formData, 'location') ||
      (format === ClassFormat.ONLINE ? 'Online through Telnyx Video' : 'The Hillside Gardens'),
    format,
    priceCents: money(formData.get('price')),
    capacity: Math.max(1, Math.min(49, integer(formData.get('capacity'), 12))),
    durationMinutes: Math.max(15, integer(formData.get('durationMinutes'), 90)),
    whatToBring: text(formData, 'whatToBring') || null,
    registrationDeadline: optionalDate(text(formData, 'registrationDeadline')),
    imageUrl: text(formData, 'imageUrl') || null,
    active: checked(formData, 'active'),
    onlineInstructions: text(formData, 'onlineInstructions') || null,
    telnyxRecordingEnabled: checked(formData, 'telnyxRecordingEnabled'),
    joinOpensMinutesBefore: Math.max(
      0,
      Math.min(240, integer(formData.get('joinOpensMinutesBefore'), 30))
    ),
    joinClosesMinutesAfter: Math.max(
      0,
      Math.min(1440, integer(formData.get('joinClosesMinutesAfter'), 60))
    )
  };

  const event = id
    ? await db.classEvent.update({ where: { id }, data })
    : await db.classEvent.create({ data });

  if (isOnlineClass(event.format) && telnyxVideoConfigured()) {
    try {
      await ensureTelnyxRoom(event);
    } catch (error) {
      console.error('Class saved, but Telnyx room preparation failed', error);
    }
  }
  refresh('/classes', '/', '/admin/content', `/admin/classes/${event.id}/studio`);
  redirect(
    adminContentPath({
      notice: id ? 'class-saved' : 'class-created',
      section: 'classes',
      item: event.id
    })
  );
}

export async function prepareClassRoom(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  if (!id) {
    redirect(adminContentPath({ error: 'content-invalid', section: 'classes' }));
  }
  const event = await db.classEvent.findUnique({ where: { id } });
  if (!event || !isOnlineClass(event.format)) {
    redirect(
      adminContentPath({ error: 'content-invalid', section: 'classes', item: id || undefined })
    );
  }
  try {
    await ensureTelnyxRoom(event);
  } catch (error) {
    console.error('Unable to prepare Telnyx room', error);
    refresh('/admin/content', `/admin/classes/${id}/studio`);
    redirect(adminContentPath({ error: 'class-room-failed', section: 'classes', item: id }));
  }
  refresh('/admin/content', `/admin/classes/${id}/studio`);
  redirect(adminContentPath({ notice: 'class-room-ready', section: 'classes', item: id }));
}

export async function resendClassConfirmation(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const next = text(formData, 'next');
  if (!id) {
    if (next === 'dashboard') redirect(adminDashboardPath({ section: 'registrations' }));
    return;
  }
  const registration = await db.classRegistration.findUnique({
    where: { id },
    include: { classEvent: true }
  });
  if (!registration || registration.status !== RegistrationStatus.PAID) {
    if (next === 'dashboard') redirect(adminDashboardPath({ section: 'registrations' }));
    return;
  }

  /**
   * Send first. Rotating `joinTokenHash` before the mail goes out would
   * invalidate the guest's current classroom link even when Resend is
   * unconfigured or rejects the message.
   */
  const credential = isOnlineClass(registration.classEvent.format)
    ? createClassJoinCredential()
    : null;

  const result = await sendClassRegistrationEmails({
    event: registration.classEvent,
    registration,
    accessToken: credential?.token,
    resend: true
  });

  if (result.sent && credential) {
    await db.classRegistration.update({
      where: { id: registration.id },
      data: { joinTokenHash: credential.hash }
    });
  }

  if (next === 'dashboard') {
    redirect(
      adminDashboardPath({
        notice: result.sent ? 'registration-emailed' : undefined,
        error: result.sent ? undefined : 'registration-email-failed',
        section: 'registrations'
      })
    );
  }

  redirect(
    `/admin/classes/${registration.classEvent.id}/studio?${
      result.sent ? 'notice=emailed' : 'error=email'
    }`
  );
}

export async function saveGalleryItem(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const data = {
    title: text(formData, 'title'),
    imageUrl: text(formData, 'imageUrl'),
    caption: text(formData, 'caption') || null,
    linkUrl: sanitizePublicHref(text(formData, 'linkUrl')),
    linkLabel: text(formData, 'linkLabel') || null,
    sortOrder: integer(formData.get('sortOrder'))
  };
  if (!data.title || !data.imageUrl) {
    redirect(
      adminContentPath({
        error: 'content-invalid',
        section: id ? 'gallery' : 'add-gallery',
        item: id || undefined
      })
    );
  }
  const item = id
    ? await db.galleryItem.update({ where: { id }, data })
    : await db.galleryItem.create({ data });
  refresh('/gallery', '/admin/content');
  redirect(
    adminContentPath({
      notice: id ? 'gallery-saved' : 'gallery-created',
      section: 'gallery',
      item: item.id
    })
  );
}

/**
 * Whether a pick carries a name of its own. `DEFAULT_PICK_TITLE` is the
 * placeholder for a link that gave up nothing readable, so it is the one title
 * a later lookup is allowed to replace.
 */
const hasOwnName = (title: string) => Boolean(title.trim()) && title.trim() !== DEFAULT_PICK_TITLE;

/** New picks land at the end of the shelf rather than on top of the first one. */
async function nextAmazonSortOrder() {
  const last = await db.amazonPick.aggregate({ _max: { sortOrder: true } });
  return (last._max.sortOrder ?? 0) + 1;
}

/**
 * The same product pasted twice — off the storefront one week, out of the phone
 * app the next — is one pick, not two. Matching on the ASIN is what makes the
 * two spellings of the link meet.
 */
async function findExistingPick(amazonUrl: string) {
  const asin = extractAsin(amazonUrl);
  return asin
    ? await db.amazonPick.findFirst({
        where: { amazonUrl: { contains: asin, mode: 'insensitive' } }
      })
    : await db.amazonPick.findFirst({ where: { amazonUrl } });
}

/**
 * Publishing a pick from nothing but the link.
 *
 * Everything else on this page asks for a title, a photo URL, a blurb and a
 * category before it will save, which is four fields between Tammy and a
 * recommendation she wanted to make in ten seconds. Here the link is the whole
 * form: we read the item page for the name, photograph, blurb and department,
 * and when Amazon will not answer — it does refuse servers it does not know —
 * the pick still publishes, named from the link itself, for her to finish by
 * hand.
 */
export async function addAmazonPickByUrl(formData: FormData) {
  await guard();
  const pasted = text(formData, 'amazonUrl');
  if (!isAmazonLink(pasted)) {
    redirect(adminContentPath({ error: 'amazon-url', section: 'add-amazon' }));
  }

  const lookup = await lookupAmazonProduct(pasted);
  const draft = amazonPickDraft(lookup.resolvedUrl || pasted, lookup.details, associateTag());

  const existing = await findExistingPick(draft.amazonUrl);
  if (existing) {
    // Re-pasting an archived pick plainly means "put it back", and anything the
    // lookup found now fills a gap the first attempt left — including the name,
    // when the first attempt could not read one and left the placeholder.
    await db.amazonPick.update({
      where: { id: existing.id },
      data: {
        active: true,
        title: hasOwnName(existing.title) ? existing.title : draft.title,
        imageUrl: existing.imageUrl || draft.imageUrl,
        description: existing.description || draft.description,
        category: existing.category || draft.category,
        amazonUrl: draft.amazonUrl
      }
    });
    refresh('/amazon', '/admin/content');
    redirect(
      adminContentPath({ notice: 'amazon-duplicate', section: 'amazon', item: existing.id })
    );
  }

  const item = await db.amazonPick.create({
    data: { ...draft, active: true, sortOrder: await nextAmazonSortOrder() }
  });
  refresh('/amazon', '/admin/content');
  redirect(
    adminContentPath({
      notice: lookup.outcome === 'ok' ? 'amazon-added' : 'amazon-added-basic',
      section: 'amazon',
      item: item.id
    })
  );
}

/**
 * A second run at the item page for a pick whose first lookup came back empty.
 *
 * It only fills blanks. Tammy's own wording is the reason a pick is on the
 * page at all, so a refresh must never quietly replace it with Amazon's.
 */
export async function fillAmazonPickFromLink(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  if (!id) return;
  const pick = await db.amazonPick.findUnique({ where: { id } });
  if (!pick) redirect(adminContentPath({ error: 'content-missing', section: 'amazon' }));

  const lookup = await lookupAmazonProduct(pick.amazonUrl);
  const draft = amazonPickDraft(
    lookup.resolvedUrl || pick.amazonUrl,
    lookup.details,
    associateTag()
  );
  const data = {
    title: hasOwnName(pick.title) ? pick.title : draft.title,
    imageUrl: pick.imageUrl || draft.imageUrl,
    description: pick.description || draft.description,
    category: pick.category || draft.category,
    amazonUrl: draft.amazonUrl
  };
  const filledSomething =
    data.title !== pick.title ||
    data.imageUrl !== pick.imageUrl ||
    data.description !== pick.description ||
    data.category !== pick.category;

  /**
   * A short link that finally resolved changes nothing Tammy can see, but it is
   * the address the pick is matched on — leaving the old one stored is how the
   * same product gets added twice later.
   */
  if (filledSomething || data.amazonUrl !== pick.amazonUrl) {
    await db.amazonPick.update({ where: { id }, data });
  }
  refresh('/amazon', '/admin/content');
  redirect(
    adminContentPath({
      notice: filledSomething ? 'amazon-filled' : 'amazon-fill-empty',
      section: 'amazon',
      item: id
    })
  );
}

export async function saveAmazonPick(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const pastedUrl = text(formData, 'amazonUrl');
  if (!isAmazonLink(pastedUrl)) {
    redirect(
      adminContentPath({
        error: 'amazon-url',
        section: id ? 'amazon' : 'add-amazon',
        item: id || undefined
      })
    );
  }

  // The typed fields win; the link only supplies what was left blank, so a pick
  // saved by hand still ends up with a name and a tagged affiliate URL.
  const draft = amazonPickDraft(
    pastedUrl,
    {
      title: text(formData, 'title'),
      description: text(formData, 'description'),
      imageUrl: text(formData, 'imageUrl'),
      category: text(formData, 'category')
    },
    associateTag()
  );
  const data = {
    ...draft,
    active: checked(formData, 'active'),
    sortOrder: formData.has('sortOrder')
      ? integer(formData.get('sortOrder'))
      : await nextAmazonSortOrder()
  };

  const item = id
    ? await db.amazonPick.update({ where: { id }, data })
    : await db.amazonPick.create({ data });
  refresh('/amazon', '/admin/content');
  redirect(
    adminContentPath({
      notice: id ? 'amazon-saved' : 'amazon-created',
      section: 'amazon',
      item: item.id
    })
  );
}

export async function archiveContent(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const kind = text(formData, 'kind');
  if (!id) return;
  if (kind === 'class') await db.classEvent.update({ where: { id }, data: { active: false } });
  if (kind === 'gallery') await db.galleryItem.delete({ where: { id } });
  if (kind === 'amazon') await db.amazonPick.update({ where: { id }, data: { active: false } });
  if (kind === 'care') await db.careSheet.update({ where: { id }, data: { published: false } });
  refresh('/classes', '/gallery', '/amazon', '/care', '/admin/content');
  const section =
    kind === 'class'
      ? 'classes'
      : kind === 'gallery'
        ? 'gallery'
        : kind === 'amazon'
          ? 'amazon'
          : 'care';
  redirect(
    adminContentPath({
      notice: kind === 'gallery' ? 'gallery-deleted' : 'content-archived',
      section,
      item: kind === 'gallery' ? undefined : id
    })
  );
}

export async function updateMessageStatus(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const rawStatus = text(formData, 'status');
  const status = Object.values(MessageStatus).includes(rawStatus as MessageStatus)
    ? (rawStatus as MessageStatus)
    : MessageStatus.READ;
  if (id) await db.contactMessage.update({ where: { id }, data: { status } });
  refresh();
  redirect(adminDashboardPath({ notice: 'message-saved', message: id, section: 'messages' }));
}

export async function updateSubscriber(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const active = checked(formData, 'active');
  if (id) {
    await db.newsletterSubscriber.update({
      where: { id },
      data: { active, unsubscribedAt: active ? null : new Date() }
    });
  }
  refresh();
  redirect(adminDashboardPath({ notice: 'subscriber-saved', section: 'subscribers' }));
}

export async function updateRegistration(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const rawStatus = text(formData, 'status');
  const status = Object.values(RegistrationStatus).includes(rawStatus as RegistrationStatus)
    ? (rawStatus as RegistrationStatus)
    : RegistrationStatus.PAID;
  if (id) await db.classRegistration.update({ where: { id }, data: { status } });
  refresh('/classes');
  redirect(adminDashboardPath({ notice: 'registration-saved', section: 'registrations' }));
}

/**
 * The merchandising taxonomy is owner-editable, which is the whole point of it:
 * when the bench starts carrying something the six built-in product types never
 * anticipated, Tammy adds a category rather than filing it under "Botanical
 * good" and waiting for a deploy.
 */
export async function saveCategory(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const title = text(formData, 'title');
  const slug = slugFrom(text(formData, 'slug'), title);
  if (!title || !slug) {
    redirect(
      adminContentPath({
        error: 'category-invalid',
        section: id ? 'categories' : 'add-category',
        item: id || undefined
      })
    );
  }

  const rawSpecKind = text(formData, 'specKind');
  const rawLegacyType = text(formData, 'legacyType');
  const data = {
    title,
    slug,
    tagline: text(formData, 'tagline') || null,
    description: text(formData, 'description') || null,
    imageUrl: text(formData, 'imageUrl') || null,
    specKind: Object.values(ProductSpecKind).includes(rawSpecKind as ProductSpecKind)
      ? (rawSpecKind as ProductSpecKind)
      : ProductSpecKind.GENERAL,
    legacyType: Object.values(ProductType).includes(rawLegacyType as ProductType)
      ? (rawLegacyType as ProductType)
      : ProductType.OTHER,
    active: checked(formData, 'active'),
    featured: checked(formData, 'featured'),
    sortOrder: integer(formData.get('sortOrder'))
  };

  let category;
  try {
    category = id
      ? await db.category.update({ where: { id }, data })
      : await db.category.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      redirect(
        adminContentPath({
          error: 'category-slug',
          section: id ? 'categories' : 'add-category',
          item: id || undefined
        })
      );
    }
    throw error;
  }

  /**
   * Changing which legacy type a category stands for has to reach the products
   * already in it, or the shop's older category links and the return-policy
   * markup would go on describing them as whatever they used to be.
   */
  await db.product.updateMany({
    where: { categoryId: category.id, type: { not: data.legacyType } },
    data: { type: data.legacyType }
  });

  refresh('/shop', '/', '/collections', '/admin/content');
  redirect(
    adminContentPath({
      notice: id ? 'category-saved' : 'category-created',
      section: 'categories',
      item: category.id
    })
  );
}

/**
 * Deleting is refused while a category still holds products: the relation nulls
 * on delete, so the products would survive but silently fall out of every
 * filter that leads to them. Hiding a category is the reversible answer, and it
 * is what the button offers instead.
 */
export async function deleteCategory(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  if (!id) redirect(adminContentPath({ error: 'category-missing', section: 'categories' }));

  const category = await db.category.findUnique({
    where: { id },
    select: { id: true, _count: { select: { products: true, promotions: true } } }
  });
  if (!category) {
    redirect(adminContentPath({ error: 'category-missing', section: 'categories' }));
  }
  if (category._count.products > 0) {
    redirect(adminContentPath({ error: 'category-in-use', section: 'categories', item: id }));
  }
  /**
   * A promo code narrowed to this category would not be deleted with it — the
   * relation nulls the column instead, and a null category means *everything*.
   * A code Tammy wrote for teas alone would quietly become a storewide one, on
   * a page that never mentioned promo codes.
   */
  if (category._count.promotions > 0) {
    redirect(adminContentPath({ error: 'category-in-promotion', section: 'categories', item: id }));
  }

  await db.category.delete({ where: { id } });
  refresh('/shop', '/', '/admin/content');
  redirect(adminContentPath({ notice: 'category-deleted', section: 'categories' }));
}

export async function setCategoryActive(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const active = text(formData, 'active') === 'true';
  if (!id) redirect(adminContentPath({ error: 'category-missing', section: 'categories' }));

  await db.category.update({ where: { id }, data: { active } });
  refresh('/shop', '/', '/admin/content');
  redirect(
    adminContentPath({
      notice: active ? 'category-shown' : 'category-hidden',
      section: 'categories',
      item: id
    })
  );
}
