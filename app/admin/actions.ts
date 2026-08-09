'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  MessageStatus,
  OrderStatus,
  ProductType,
  RegistrationStatus
} from '@prisma/client';
import { clearAdminSession, isAdmin, setAdminSession } from '@/lib/admin';
import { db } from '@/lib/db';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';

const text = (form: FormData, name: string) => String(form.get(name) || '').trim();
const checked = (form: FormData, name: string) => form.get(name) === 'on' || form.get(name) === 'true';
const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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

export async function loginAdmin(formData: FormData) {
  const password = text(formData, 'password');
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    redirect('/admin?error=1');
  }
  await setAdminSession();
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
  const slug = slugify(text(formData, 'slug') || name);
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
    inventory: Math.max(0, integer(formData.get('inventory'))),
    imageUrl: text(formData, 'imageUrl') || null,
    badge: text(formData, 'badge') || null,
    active: checked(formData, 'active'),
    featured: checked(formData, 'featured'),
    sortOrder: integer(formData.get('sortOrder'))
  };

  if (!name || !slug || !data.description || priceCents < 0) return;
  if (id) await db.product.update({ where: { id }, data });
  else await db.product.create({ data });
  refresh('/shop', '/', `/shop/${slug}`);
}

export async function archiveProduct(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  if (id) await db.product.update({ where: { id }, data: { active: false, featured: false } });
  refresh('/shop', '/');
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
  const order = await db.order.update({
    where: { id },
    data: {
      status,
      trackingCarrier,
      trackingNumber,
      internalNotes,
      fulfilledAt: status === OrderStatus.FULFILLED ? before.fulfilledAt || new Date() : null
    }
  });

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
        `<p>Hi ${escapeHtml(order.customerName)},</p><p>Tammy has marked order <strong>${escapeHtml(order.invoiceNumber)}</strong> as shipped.</p>${tracking}<p>You can also check the current order status on The Hillside Gardens website using your order number and checkout email.</p>`
      )
    });
  }

  refresh('/order-status');
}

export async function saveClassEvent(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const title = text(formData, 'title');
  const slug = slugify(text(formData, 'slug') || title) || null;
  const startsAt = optionalDate(text(formData, 'startsAt'));
  if (!title || !startsAt) return;
  const data = {
    title,
    slug,
    description: text(formData, 'description'),
    startsAt,
    location: text(formData, 'location'),
    priceCents: money(formData.get('price')),
    capacity: Math.max(1, integer(formData.get('capacity'), 12)),
    durationMinutes: Math.max(15, integer(formData.get('durationMinutes'), 90)),
    whatToBring: text(formData, 'whatToBring') || null,
    registrationDeadline: optionalDate(text(formData, 'registrationDeadline')),
    imageUrl: text(formData, 'imageUrl') || null,
    active: checked(formData, 'active')
  };
  if (id) await db.classEvent.update({ where: { id }, data });
  else await db.classEvent.create({ data });
  refresh('/classes', '/', '/admin/content');
}

export async function saveGalleryItem(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const data = {
    title: text(formData, 'title'),
    imageUrl: text(formData, 'imageUrl'),
    caption: text(formData, 'caption') || null,
    sortOrder: integer(formData.get('sortOrder'))
  };
  if (!data.title || !data.imageUrl) return;
  if (id) await db.galleryItem.update({ where: { id }, data });
  else await db.galleryItem.create({ data });
  refresh('/gallery', '/admin/content');
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
  if (!data.title || !data.amazonUrl) return;
  if (id) await db.amazonPick.update({ where: { id }, data });
  else await db.amazonPick.create({ data });
  refresh('/amazon', '/admin/content');
}

export async function saveCareSheet(formData: FormData) {
  await guard();
  const id = text(formData, 'id');
  const plantName = text(formData, 'plantName');
  const slug = slugify(text(formData, 'slug') || plantName);
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
    published: checked(formData, 'published')
  };
  if (!plantName || !slug || !data.summary) return;
  if (id) await db.careSheet.update({ where: { id }, data });
  else await db.careSheet.create({ data });
  refresh('/care', `/care/${slug}`, '/admin/content');
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
}
