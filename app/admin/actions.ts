'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ClassFormat,
  MessageStatus,
  OrderStatus,
  ProductType,
  RegistrationStatus,
  ReviewStatus
} from '@prisma/client';
import { authenticateAdmin, clearAdminSession, isAdmin, setAdminSession } from '@/lib/admin';
import { Prisma } from '@prisma/client';
import { clientKeyFromHeaders, rateLimitedByKey } from '@/lib/rate-limit';
import { isNavigationCollection } from '@/lib/collections';
import { createClassJoinCredential, isOnlineClass } from '@/lib/class-access';
import { sendClassRegistrationEmails } from '@/lib/class-registration-email';
import { db } from '@/lib/db';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { ensureTelnyxRoom, telnyxVideoConfigured } from '@/lib/telnyx-video';
import { notifyStockAlerts } from '@/lib/stock-alerts';
import { releaseProductHold } from '@/lib/checkout';
import { adminContentPath, adminDashboardPath, uniqueConstraintField } from '@/lib/admin-dashboard';
import { sendOrderConfirmationEmail } from '@/lib/order-send';

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
const integer = (value: FormDataEntryValue | null, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
};
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

export async function saveProduct(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const name = text(formData, 'name');
  const slug = slugFrom(text(formData, 'slug'), name);
  const rawType = text(formData, 'type');
  const type = Object.values(ProductType).includes(rawType as ProductType)
    ? (rawType as ProductType)
    : ProductType.OTHER;
  const priceCents = money(formData.get('price'));
  const compareAtText = text(formData, 'compareAt');
  const data = {
    name,
    slug,
    sku: text(formData, 'sku') || null,
    shortDescription: text(formData, 'shortDescription') || null,
    description: text(formData, 'description'),
    details: text(formData, 'details') || null,
    careNotes: text(formData, 'careNotes') || null,
    shippingNote: text(formData, 'shippingNote') || null,
    type,
    priceCents,
    compareAtCents: compareAtText ? money(formData.get('compareAt')) : null,
    imageUrl: text(formData, 'imageUrl') || null,
    badge: text(formData, 'badge') || null,
    active: checked(formData, 'active'),
    featured: checked(formData, 'featured'),
    sortOrder: integer(formData.get('sortOrder')),
    galleryImages: text(formData, 'galleryImages')
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 8)
  };

  if (!name || !slug || !data.description || priceCents < 0) {
    redirect(
      adminDashboardPath({
        error: 'product-invalid',
        product: id ? slug || undefined : undefined,
        section: id ? 'inventory' : 'add-product'
      })
    );
  }

  const postedInventory = Math.max(0, integer(formData.get('inventory')));
  const expectedInventory = integer(formData.get('expectedInventory'), postedInventory);

  const collectionIds = formData
    .getAll('collectionIds')
    .map((value) => String(value))
    .filter(Boolean);

  const previous = id
    ? await db.product.findUnique({ where: { id }, select: { inventory: true, slug: true } })
    : null;

  let product;
  try {
    if (!id) {
      product = await db.product.create({
        data: {
          ...data,
          inventory: postedInventory,
          collections: { connect: collectionIds.map((collectionId) => ({ id: collectionId })) }
        }
      });
    } else if (postedInventory === expectedInventory) {
      /**
       * The owner did not change the quantity box. Leave the column alone so a
       * checkout hold that landed while this form was open is not written back
       * over with the stale on-hand figure.
       */
      product = await db.product.update({
        where: { id },
        data: {
          ...data,
          collections: { set: collectionIds.map((collectionId) => ({ id: collectionId })) }
        }
      });
    } else {
      const claimed = await db.product.updateMany({
        where: { id, inventory: expectedInventory },
        data: { inventory: postedInventory }
      });
      if (claimed.count === 0) {
        redirect(adminDashboardPath({ error: 'inventory', product: slug, section: 'inventory' }));
      }
      product = await db.product.update({
        where: { id },
        data: {
          ...data,
          collections: { set: collectionIds.map((collectionId) => ({ id: collectionId })) }
        }
      });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const field = uniqueConstraintField(error.meta?.target);
      redirect(
        adminDashboardPath({
          error: field === 'sku' ? 'sku' : 'slug',
          product: previous?.slug,
          section: id ? 'inventory' : 'add-product'
        })
      );
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
  redirect(
    adminDashboardPath({
      notice: id ? 'product-saved' : 'product-created',
      product: product.slug,
      section: 'inventory'
    })
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

  const existing = id ? await db.collection.findUnique({ where: { id } }) : null;

  // A collection the header links to keeps its slug and stays visible; renaming
  // or hiding it would break the primary navigation.
  const locked = Boolean(existing && isNavigationCollection(existing.slug));
  const slug = locked ? existing!.slug : requestedSlug;

  const data = {
    title,
    slug,
    tagline: text(formData, 'tagline') || null,
    description: text(formData, 'description') || null,
    imageUrl: text(formData, 'imageUrl') || null,
    featured: checked(formData, 'featured'),
    active: locked ? true : checked(formData, 'active'),
    sortOrder: integer(formData.get('sortOrder'))
  };

  const collection = id
    ? await db.collection.update({ where: { id }, data })
    : await db.collection.create({ data });
  refresh('/', '/collections', `/collections/${slug}`, '/shop');
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
  if (isNavigationCollection(collection.slug)) {
    redirect(
      adminContentPath({
        error: 'collection-locked',
        section: 'collections',
        item: id
      })
    );
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
  const status = Object.values(OrderStatus).includes(rawStatus as OrderStatus)
    ? (rawStatus as OrderStatus)
    : OrderStatus.PAID;
  if (!id) return;

  const before = await db.order.findUnique({ where: { id } });
  if (!before) return;
  const trackingCarrier = text(formData, 'trackingCarrier') || null;
  const trackingNumber = text(formData, 'trackingNumber') || null;
  const internalNotes = text(formData, 'internalNotes') || null;

  if (status === OrderStatus.CANCELLED && before.status === OrderStatus.PENDING) {
    await releaseProductHold(id);
    await db.order.update({
      where: { id },
      data: { trackingCarrier, trackingNumber, internalNotes }
    });
    refresh('/order-status');
    redirect(adminDashboardPath({ notice: 'order-saved', order: id, section: 'orders' }));
    return;
  }

  const order = await db.order.update({
    where: { id },
    data: {
      status,
      trackingCarrier,
      trackingNumber,
      internalNotes,
      fulfilledAt: status === OrderStatus.FULFILLED ? before.fulfilledAt || new Date() : null
    },
    include: { items: true }
  });

  if (
    status === OrderStatus.REFUNDED &&
    before.status !== OrderStatus.REFUNDED &&
    !before.inventoryRestoredAt
  ) {
    await db.$transaction(async (transaction) => {
      const claimed = await transaction.order.updateMany({
        where: { id: order.id, inventoryRestoredAt: null },
        data: { inventoryRestoredAt: new Date() }
      });
      if (claimed.count === 0) return;
      for (const item of order.items) {
        await transaction.product.update({
          where: { id: item.productId },
          data: { inventory: { increment: item.quantity } }
        });
      }
    });
  }

  if (status === OrderStatus.FULFILLED && before.status !== OrderStatus.FULFILLED && order.email) {
    const tracking = trackingNumber
      ? `<p><strong>Tracking:</strong> ${escapeHtml(trackingCarrier || 'Carrier')} ${escapeHtml(trackingNumber)}</p>`
      : '';
    await sendEmail({
      to: order.email,
      subject: `Your Hillside order ${order.invoiceNumber} has shipped`,
      idempotencyKey: `shipping-update/${order.id}/${trackingNumber || 'fulfilled'}`,
      html: emailShell(
        'Your order is on the way',
        `<p>Hi ${escapeHtml(order.customerName)},</p><p>We have marked order <strong>${escapeHtml(order.invoiceNumber)}</strong> as shipped.</p>${tracking}<p>You can also check the current order status on The Hillside Gardens website using your order number and checkout email.</p>`
      )
    });
  }

  refresh('/order-status');
  redirect(adminDashboardPath({ notice: 'order-saved', order: order.id, section: 'orders' }));
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
    linkUrl: text(formData, 'linkUrl') || null,
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

export async function saveAmazonPick(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const data = {
    title: text(formData, 'title'),
    description: text(formData, 'description') || null,
    imageUrl: text(formData, 'imageUrl') || null,
    amazonUrl: text(formData, 'amazonUrl'),
    category: text(formData, 'category') || null,
    active: checked(formData, 'active'),
    sortOrder: integer(formData.get('sortOrder'))
  };
  if (!data.title || !data.amazonUrl) {
    redirect(
      adminContentPath({
        error: 'content-invalid',
        section: id ? 'amazon' : 'add-amazon',
        item: id || undefined
      })
    );
  }
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

export async function saveCareSheet(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const plantName = text(formData, 'plantName');
  const slug = slugFrom(text(formData, 'slug'), plantName);
  const data = {
    plantName,
    slug,
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
    imageUrl: text(formData, 'imageUrl') || null,
    productId: text(formData, 'productId') || null,
    published: checked(formData, 'published')
  };
  if (!plantName || !slug || !data.summary) {
    redirect(
      adminContentPath({
        error: 'content-invalid',
        section: id ? 'care' : 'add-care',
        item: id || undefined
      })
    );
  }
  const sheet = id
    ? await db.careSheet.update({ where: { id }, data })
    : await db.careSheet.create({ data });
  refresh('/care', `/care/${slug}`, '/admin/content');
  redirect(
    adminContentPath({
      notice: id ? 'care-saved' : 'care-created',
      section: 'care',
      item: sheet.id
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
