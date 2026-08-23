import '../../classroom.css';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { AmazonPick, Category, ClassEvent, Collection, GalleryItem } from '@prisma/client';
import { ClassFormat, ProductSpecKind, ProductType } from '@prisma/client';
import AdminDeepLink from '@/components/AdminDeepLink';
import ConfirmSubmit from '@/components/ConfirmSubmit';
import PendingSubmit from '@/components/PendingSubmit';
import { isAdmin } from '@/lib/admin';
import {
  ADMIN_ERRORS,
  ADMIN_NOTICES,
  firstSearchParam
} from '@/lib/admin-dashboard';
import { careGuideTypeLabel } from '@/lib/care-seed-data';
import { faqLines } from '@/lib/category-content';
import { SPEC_KIND_LABELS } from '@/lib/product-categories';
import { classFormatLabel, isOnlineClass } from '@/lib/class-access';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { db } from '@/lib/db';
import { productTypeLabel } from '@/lib/store';
import { telnyxVideoConfigured } from '@/lib/telnyx-video';
import {
  addAmazonPickByUrl,
  archiveContent,
  deleteCategory,
  deleteCollection,
  fillAmazonPickFromLink,
  prepareClassRoom,
  saveAmazonPick,
  saveCategory,
  saveClassEvent,
  saveCollection,
  saveGalleryItem,
  setCategoryActive
} from '../actions';

/**
 * A category is the structural half of the shop's navigation, so its form asks two
 * questions a collection's does not: which detail fields its products are asked for,
 * and which of the six legacy product types they are recorded as. Both have
 * consequences beyond this page, so both are explained where they are answered.
 */
function CategoryFields({
  category,
  careSheets = []
}: {
  category?: Category & { careSheets?: Array<{ id: string }> };
  careSheets?: Array<{ id: string; plantName: string }>;
}) {
  const linkedGuides = new Set((category?.careSheets || []).map((sheet) => sheet.id));
  return (
    <>
      {category && <input type="hidden" name="id" value={category.id} />}
      <div className="admin-form-grid">
        <label className="admin-label">Category name<input className="admin-input" name="title" defaultValue={category?.title} required /></label>
        <label className="admin-label">URL slug<input className="admin-input" name="slug" defaultValue={category?.slug || ''} placeholder="created-from-name" /></label>
        <label className="admin-label">Short tagline<input className="admin-input" name="tagline" defaultValue={category?.tagline || ''} placeholder="Living beauty for every room" /></label>
        <label className="admin-label">Display order<input className="admin-input" name="sortOrder" type="number" defaultValue={category?.sortOrder ?? 0} /></label>
        <label className="admin-label">
          Which details its products are asked for
          <select className="admin-input" name="specKind" defaultValue={category?.specKind || ProductSpecKind.GENERAL}>
            {Object.values(ProductSpecKind).map((kind) => (<option value={kind} key={kind}>{SPEC_KIND_LABELS[kind]}</option>))}
          </select>
          <span className="admin-hint">Chooses the fields on the product form — a tea is asked for its steep time and allergens, a carnivorous plant for its dormancy and water type.</span>
        </label>
        <label className="admin-label">
          Counts as
          <select className="admin-input" name="legacyType" defaultValue={category?.legacyType || ProductType.OTHER}>
            {Object.values(ProductType).map((type) => (<option value={type} key={type}>{productTypeLabel(type)}</option>))}
          </select>
          <span className="admin-hint">The broad shelf used by the returns policy shown in search results. Live plants and teas are final sale; everything else may be returned unopened.</span>
        </label>
        <label className="admin-label full">Description<textarea className="admin-input" name="description" rows={3} defaultValue={category?.description || ''} /></label>
        <label className="admin-label full">Cover photo URL<input className="admin-input" name="imageUrl" type="text" defaultValue={category?.imageUrl || ''} /></label>
        {/* The category's own page at /categories/<slug>. Without these it is a
            filter on the shop, which is a grid rather than a page. */}
        <label className="admin-label full">
          Introduction (shown above the products)
          <textarea className="admin-input" name="intro" rows={4} defaultValue={category?.intro || ''} placeholder="One or two short paragraphs about what is in this category and who it suits." />
          <span className="admin-hint">Leave a blank line between paragraphs.</span>
        </label>
        <label className="admin-label full">
          Longer writing (shown under the products)
          <textarea className="admin-input" name="body" rows={8} defaultValue={category?.body || ''} placeholder={'Choosing one:\n\nWhat to look for...\n\nLiving with it:\n\nWhat to expect...'} />
          <span className="admin-hint">Blank line between paragraphs. A short line ending in a colon becomes a heading.</span>
        </label>
        <label className="admin-label full">
          Questions and answers
          <textarea className="admin-input" name="faq" rows={5} defaultValue={faqLines(category?.faq)} placeholder={'How often should I water this? | Check the soil rather than the calendar.'} />
          <span className="admin-hint">One per line: <b>question | answer</b>. These show on the page and are the only thing that makes the category eligible for question-and-answer results in Google, so write what people actually ask.</span>
        </label>
        <label className="admin-label">Page title for search results<input className="admin-input" name="metaTitle" defaultValue={category?.metaTitle || ''} placeholder="Leave empty to use the category name" /></label>
        <label className="admin-label">
          Words people search for
          <input className="admin-input" name="keywords" defaultValue={(category?.keywords || []).join(', ')} placeholder="carnivorous plants, venus flytrap, pitcher plant" />
          <span className="admin-hint">Comma separated. Used by the site search, never shown.</span>
        </label>
        <label className="admin-label full">Description for search results<textarea className="admin-input" name="metaDescription" rows={2} defaultValue={category?.metaDescription || ''} placeholder="Leave empty to use the introduction above." /></label>
      </div>
      {careSheets.length > 0 && (
        <fieldset className="admin-collection-picker">
          <legend>Care guides to show on this category page</legend>
          <span className="admin-hint">These appear under the products and link into the care library.</span>
          {careSheets.map((sheet) => (
            <label className="admin-checkbox" key={sheet.id}>
              <input type="checkbox" name="careSheetIds" value={sheet.id} defaultChecked={linkedGuides.has(sheet.id)} />{' '}
              {sheet.plantName}
            </label>
          ))}
        </fieldset>
      )}
      <div className="admin-actions">
        <label className="admin-checkbox"><input name="active" type="checkbox" defaultChecked={category?.active ?? true} /> Shown in the shop</label>
        <label className="admin-checkbox"><input name="featured" type="checkbox" defaultChecked={category?.featured ?? true} /> Offer as a shop-by tile and a filter chip</label>
      </div>
    </>
  );
}

function CollectionFields({
  collection,
  careSheets = []
}: {
  collection?: Collection & { careSheets?: Array<{ id: string }> };
  careSheets?: Array<{ id: string; plantName: string }>;
}) {
  const linkedGuides = new Set((collection?.careSheets || []).map((sheet) => sheet.id));
  return (
    <>
      {collection && <input type="hidden" name="id" value={collection.id} />}
      <div className="admin-form-grid">
        <label className="admin-label">Collection name<input className="admin-input" name="title" defaultValue={collection?.title} required /></label>
        <label className="admin-label">URL slug<input className="admin-input" name="slug" defaultValue={collection?.slug || ''} placeholder="created-from-name" /></label>
        <label className="admin-label">Short tagline<input className="admin-input" name="tagline" defaultValue={collection?.tagline || ''} placeholder="Living beauty for every room" /></label>
        <label className="admin-label">Display order<input className="admin-input" name="sortOrder" type="number" defaultValue={collection?.sortOrder ?? 0} /></label>
        <label className="admin-label full">Description<textarea className="admin-input" name="description" rows={3} defaultValue={collection?.description || ''} /></label>
        <label className="admin-label full">Cover photo URL<input className="admin-input" name="imageUrl" type="text" defaultValue={collection?.imageUrl || ''} /></label>
        {/* Everything below turns this collection from a filtered grid into a
            page worth landing on. A shopper deciding between a pitcher plant and
            a sundew needs sentences, not a heading over a product grid. */}
        <label className="admin-label full">
          Introduction (shown above the products)
          <textarea className="admin-input" name="intro" rows={4} defaultValue={collection?.intro || ''} placeholder="One or two short paragraphs about what is in this collection and who it suits." />
          <span className="admin-hint">Leave a blank line between paragraphs.</span>
        </label>
        <label className="admin-label full">
          Longer writing (shown under the products)
          <textarea className="admin-input" name="body" rows={8} defaultValue={collection?.body || ''} placeholder={'Choosing one:\n\nWhat to look for...\n\nLiving with it:\n\nWhat to expect...'} />
          <span className="admin-hint">Blank line between paragraphs. A short line ending in a colon becomes a heading.</span>
        </label>
        <label className="admin-label full">
          Questions and answers
          <textarea className="admin-input" name="faq" rows={5} defaultValue={faqLines(collection?.faq)} placeholder={'How often should I water this? | Check the soil rather than the calendar.'} />
          <span className="admin-hint">
            One per line: <b>question | answer</b>. These show on the page and are the only thing
            that makes the collection eligible for question-and-answer results in Google, so write
            what people actually ask.
          </span>
        </label>
        <label className="admin-label">Page title for search results<input className="admin-input" name="metaTitle" defaultValue={collection?.metaTitle || ''} placeholder="Leave empty to use the collection name" /></label>
        <label className="admin-label">
          Words people search for
          <input className="admin-input" name="keywords" defaultValue={(collection?.keywords || []).join(', ')} placeholder="carnivorous plants, venus flytrap, pitcher plant" />
          <span className="admin-hint">Comma separated. Used by the site search, never shown.</span>
        </label>
        <label className="admin-label full">Description for search results<textarea className="admin-input" name="metaDescription" rows={2} defaultValue={collection?.metaDescription || ''} placeholder="Leave empty to use the introduction above." /></label>
      </div>
      {careSheets.length > 0 && (
        <fieldset className="admin-collection-picker">
          <legend>Care guides to show on this collection page</legend>
          <span className="admin-hint">These appear under the products and link into the care library.</span>
          {careSheets.map((sheet) => (
            <label className="admin-checkbox" key={sheet.id}>
              <input type="checkbox" name="careSheetIds" value={sheet.id} defaultChecked={linkedGuides.has(sheet.id)} />{' '}
              {sheet.plantName}
            </label>
          ))}
        </fieldset>
      )}
      <div className="admin-actions">
        <label className="admin-checkbox"><input name="active" type="checkbox" defaultChecked={collection?.active ?? true} /> Visible on the website</label>
        <label className="admin-checkbox"><input name="featured" type="checkbox" defaultChecked={collection?.featured ?? true} /> Show as a tile on the homepage</label>
      </div>
    </>
  );
}

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Website Content Manager' };

const localDateTime = (date?: Date | null) => {
  if (!date) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

function ClassFields({ event }: { event?: ClassEvent }) {
  return (
    <>
      {event && <input type="hidden" name="id" value={event.id} />}
      <div className="admin-form-grid">
        <label className="admin-label">Class title<input className="admin-input" name="title" defaultValue={event?.title} required /></label>
        <label className="admin-label">URL slug<input className="admin-input" name="slug" defaultValue={event?.slug || ''} placeholder="created-from-title" /></label>
        <label className="admin-label">Class format
          <select className="admin-input" name="format" defaultValue={event?.format || ClassFormat.IN_PERSON}>
            <option value={ClassFormat.IN_PERSON}>In person</option>
            <option value={ClassFormat.ONLINE}>Online through Telnyx Video</option>
            <option value={ClassFormat.HYBRID}>Hybrid: in person + online</option>
          </select>
        </label>
        <label className="admin-label">Location
          <input className="admin-input" name="location" defaultValue={event?.location || ''} placeholder="Leave blank for an online-only class" />
        </label>
        <label className="admin-label full">Description<textarea className="admin-input" name="description" rows={4} defaultValue={event?.description} required /></label>
        <label className="admin-label">Date and time<input className="admin-input" name="startsAt" type="datetime-local" defaultValue={localDateTime(event?.startsAt)} required /></label>
        <label className="admin-label">Registration deadline<input className="admin-input" name="registrationDeadline" type="datetime-local" defaultValue={localDateTime(event?.registrationDeadline)} /></label>
        <label className="admin-label">Price per person<input className="admin-input" name="price" type="number" min="0" step="0.01" defaultValue={event ? (event.priceCents / 100).toFixed(2) : ''} required /></label>
        <label className="admin-label">Total seats<input className="admin-input" name="capacity" type="number" min="1" max="49" defaultValue={event?.capacity ?? 12} required /></label>
        <label className="admin-label">Duration in minutes<input className="admin-input" name="durationMinutes" type="number" min="15" step="15" defaultValue={event?.durationMinutes ?? 90} /></label>
        <label className="admin-label">Online room opens minutes before class<input className="admin-input" name="joinOpensMinutesBefore" type="number" min="0" max="240" defaultValue={event?.joinOpensMinutesBefore ?? 30} /></label>
        <label className="admin-label">Online room closes minutes after class<input className="admin-input" name="joinClosesMinutesAfter" type="number" min="0" max="1440" defaultValue={event?.joinClosesMinutesAfter ?? 60} /></label>
        <label className="admin-label full">Online class instructions<textarea className="admin-input" name="onlineInstructions" rows={3} defaultValue={event?.onlineInstructions || ''} placeholder="Supplies, camera setup, what customers should have ready, or other online-class notes" /></label>
        <label className="admin-label full">What to bring / what is included<textarea className="admin-input" name="whatToBring" rows={2} defaultValue={event?.whatToBring || ''} /></label>
        <label className="admin-label full">Photo URL<input className="admin-input" name="imageUrl" type="text" defaultValue={event?.imageUrl || ''} /></label>
      </div>
      <div className="admin-actions">
        <label className="admin-checkbox"><input name="active" type="checkbox" defaultChecked={event?.active ?? true} /> Published and open for registration</label>
        <label className="admin-checkbox"><input name="telnyxRecordingEnabled" type="checkbox" defaultChecked={event?.telnyxRecordingEnabled ?? false} /> Enable Telnyx room recording and show participant notice</label>
      </div>
    </>
  );
}

function GalleryFields({ item }: { item?: GalleryItem }) {
  return (
    <>
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="admin-form-grid">
        <label className="admin-label">Arrangement title<input className="admin-input" name="title" defaultValue={item?.title} required /></label>
        <label className="admin-label">Display order<input className="admin-input" name="sortOrder" type="number" defaultValue={item?.sortOrder ?? 0} /></label>
        <label className="admin-label full">Photo URL<input className="admin-input" name="imageUrl" type="text" defaultValue={item?.imageUrl} required /></label>
        <label className="admin-label full">Caption<textarea className="admin-input" name="caption" rows={3} defaultValue={item?.caption || ''} /></label>
        <label className="admin-label">
          Link to a product, collection or class
          <input className="admin-input" name="linkUrl" type="text" defaultValue={item?.linkUrl || ''} placeholder="/shop/monstera-deliciosa" />
        </label>
        <label className="admin-label">
          Link wording
          <input className="admin-input" name="linkLabel" defaultValue={item?.linkLabel || ''} placeholder="Shop this look" />
        </label>
      </div>
    </>
  );
}

function AmazonFields({ item }: { item?: AmazonPick }) {
  return (
    <>
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="admin-form-grid">
        <label className="admin-label">Product title<input className="admin-input" name="title" defaultValue={item?.title} required /></label>
        <label className="admin-label">Category<input className="admin-input" name="category" defaultValue={item?.category || ''} placeholder="Plant tools" /></label>
        <label className="admin-label full">Amazon link<input className="admin-input" name="amazonUrl" type="text" inputMode="url" defaultValue={item?.amazonUrl} required /></label>
        <label className="admin-label full">Photo URL<input className="admin-input" name="imageUrl" type="text" defaultValue={item?.imageUrl || ''} /></label>
        <label className="admin-label full">Why we recommend it<textarea className="admin-input" name="description" rows={3} defaultValue={item?.description || ''} /></label>
        <label className="admin-label">Display order<input className="admin-input" name="sortOrder" type="number" defaultValue={item?.sortOrder ?? 0} /></label>
      </div>
      <label className="admin-checkbox" style={{ marginTop: 12 }}><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /> Show on public page</label>
    </>
  );
}

export default async function ContentManager({
  searchParams
}: {
  searchParams: Promise<{
    notice?: string | string[];
    error?: string | string[];
    section?: string | string[];
    item?: string | string[];
  }>;
}) {
  if (!(await isAdmin())) redirect('/admin');
  const params = await searchParams;
  const notice = ADMIN_NOTICES[firstSearchParam(params.notice)];
  const errorMessage = ADMIN_ERRORS[firstSearchParam(params.error)];
  const focusSection = firstSearchParam(params.section);
  const focusItem = firstSearchParam(params.item);
  const focusPrefix =
    focusSection === 'classes'
      ? 'class'
      : focusSection === 'collections'
        ? 'collection'
        : focusSection || 'item';
  const [classes, gallery, picks, sheets, collections, categories] = await Promise.all([
    db.classEvent.findMany({ orderBy: { startsAt: 'desc' } }),
    db.galleryItem.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] }),
    db.amazonPick.findMany({ orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { title: 'asc' }] }),
    db.careSheet.findMany({ orderBy: [{ published: 'desc' }, { plantName: 'asc' }] }),
    db.collection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: {
        _count: { select: { products: { where: { active: true } } } },
        careSheets: { select: { id: true } }
      }
    }),
    db.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: {
        _count: { select: { products: true } },
        careSheets: { select: { id: true } }
      }
    })
  ]);
  const telnyxReady = telnyxVideoConfigured();

  return (
    <div className="adminshell">
      <AdminDeepLink
        section={focusSection || undefined}
        focusId={focusItem ? `${focusPrefix}-${focusItem}` : undefined}
      />
      <aside className="sidebar">
        <img src="/logo.webp" alt="The Hillside Gardens" />
        <b>Website Content Manager</b>
        <Link href="/admin">← Business dashboard</Link>
        <a href="#categories">Categories</a>
        <Link href="/admin/merchandising">Merchandising</Link>
        <a href="#collections">Collections</a>
        <a href="#classes">Classes</a>
        <a href="#gallery">Gallery</a>
        <a href="#amazon">Amazon picks</a>
        <a href="#care">Plant care library</a>
        <Link href="/admin/care">Open care library</Link>
        <Link href="/admin/merchandising">Merchandising</Link>
        <Link href="/">View public website</Link>
      </aside>
      <div className="adminmain">
        <div className="eyebrow">Easy website editor</div>
        <h1>Website content</h1>
        <p className="muted">Use the forms below to publish and update content without changing code.</p>
        {notice && (
          <div className="admin-card admin-notice" role="status">
            <b>{notice}</b>
          </div>
        )}
        {errorMessage && (
          <div className="admin-card admin-alert" role="alert">
            <b>{errorMessage}</b>
          </div>
        )}
        <div className="statgrid">
          <div className="stat"><span>Classes</span><strong>{classes.filter((item) => item.active).length}</strong></div>
          <div className="stat"><span>Online classes</span><strong>{classes.filter((item) => item.active && isOnlineClass(item.format)).length}</strong></div>
          <div className="stat"><span>Gallery photos</span><strong>{gallery.length}</strong></div>
          <div className="stat"><span>Amazon picks</span><strong>{picks.filter((item) => item.active).length}</strong></div>
          <div className="stat"><span>Care sheets</span><strong>{sheets.filter((item) => item.published).length}</strong></div>
          <div className="stat"><span>Categories</span><strong>{categories.filter((item) => item.active).length}</strong></div>
          <div className="stat"><span>Collections</span><strong>{collections.filter((item) => item.active).length}</strong></div>
          <div className="stat"><span>Telnyx Video</span><strong>{telnyxReady ? 'Ready' : 'Setup'}</strong></div>
        </div>

        <section className="admin-section" id="categories">
          <h2>Categories</h2>
          <p className="muted">
            A category says <b>what a thing is</b> — Houseplants, Carnivorous Plants, Tea Accessories.
            Every product sits in exactly one, and it is what the shop&rsquo;s filters and the site
            header navigate by. It also decides which details a product is asked for on its own page,
            so a tea is asked about caffeine and a flytrap about dormancy.
          </p>
          <div className="admin-list">
            {categories.map((category) => (
              <details key={category.id} id={`category-${category.id}`} open={focusItem === category.id}>
                <summary>
                  <span>
                    {category.title} • {category._count.products}{' '}
                    {category._count.products === 1 ? 'product' : 'products'} •{' '}
                    {SPEC_KIND_LABELS[category.specKind].toLowerCase()} details
                  </span>
                  <span className={`status-badge ${category.active ? 'PAID' : 'CANCELLED'}`}>
                    {category.active ? 'Shown' : 'Hidden'}
                  </span>
                </summary>
                <div>
                  <form action={saveCategory}>
                    <CategoryFields category={category} careSheets={sheets} />
                    <div className="admin-actions">
                      <button className="btn small">Save category</button>
                      <Link className="btn outline small" href={`/categories/${category.slug}`}>View the page</Link>
                    </div>
                  </form>
                  <div className="admin-actions">
                    <form action={setCategoryActive}>
                      <input type="hidden" name="id" value={category.id} />
                      <input type="hidden" name="active" value={category.active ? 'false' : 'true'} />
                      <button className={`text-button${category.active ? ' danger' : ''}`}>
                        {category.active ? 'Hide from the shop' : 'Show in the shop'}
                      </button>
                    </form>
                    {/* Deleting is only offered while nothing would be orphaned by it: the
                        relation nulls on delete, so a product would survive and silently
                        fall out of every filter that leads to it. */}
                    {category._count.products === 0 && (
                      <form action={deleteCategory}>
                        <input type="hidden" name="id" value={category.id} />
                        <ConfirmSubmit className="text-button danger" message={`Delete “${category.title}”? It holds no products, so nothing will lose its category.`}>
                          Delete category
                        </ConfirmSubmit>
                      </form>
                    )}
                  </div>
                </div>
              </details>
            ))}
          </div>
          <div className="admin-card" id="add-category" style={{ marginTop: 20 }}>
            <h2 style={{ marginTop: 0 }}>Add a category</h2>
            <p className="muted">Add one whenever the bench starts carrying something the list does not describe.</p>
            <form action={saveCategory}>
              <CategoryFields careSheets={sheets} />
              <button className="btn" style={{ marginTop: 14 }}>Create category</button>
            </form>
          </div>
        </section>

        <section className="admin-section" id="collections">
          <h2>Collections</h2>
          <p className="muted">
            A collection says <b>why you might want it</b> — Beginner Friendly, Low Light, Pet
            Friendly, Gifts Under $30 — and a product joins as many as apply, on top of the one
            category it belongs to. A collection only appears on the website once it holds at least
            one active product; assign products from the
            <Link className="text-link" href="/admin#inventory"> inventory section</Link> of the business dashboard.
          </p>
          <div className="admin-list">
            {collections.map((collection) => (
              <details
                key={collection.id}
                id={`collection-${collection.id}`}
                open={focusItem === collection.id}
              >
                <summary>
                  <span>
                    {collection.title} • {collection._count.products}{' '}
                    {collection._count.products === 1 ? 'product' : 'products'}
                    {collection.featured && collection._count.products === 0 && (
                      <> • <b className="needs-photo">empty, hidden from homepage</b></>
                    )}
                  </span>
                  <span className={`status-badge ${collection.active ? 'PAID' : 'CANCELLED'}`}>
                    {collection.active ? 'Visible' : 'Hidden'}
                  </span>
                </summary>
                <div>
                  <form action={saveCollection}>
                    <CollectionFields collection={collection} careSheets={sheets} />
                    <div className="admin-actions">
                      <button className="btn small">Save collection</button>
                      <Link className="btn outline small" href={`/collections/${collection.slug}`}>View collection</Link>
                    </div>
                  </form>
                  {/* Every collection is the owner's to delete: the header navigates by
                      category now, so nothing structural depends on one surviving. */}
                  <form action={deleteCollection} style={{ marginTop: 10 }}>
                    <input type="hidden" name="id" value={collection.id} />
                    <ConfirmSubmit
                      className="text-button danger"
                      message={`Delete “${collection.title}”? Products stay in inventory, but this collection page will 404.`}
                    >
                      Delete collection
                    </ConfirmSubmit>
                  </form>
                </div>
              </details>
            ))}
          </div>
          <div className="admin-card" id="add-collection" style={{ marginTop: 20 }}>
            <h2 style={{ marginTop: 0 }}>Add a collection</h2>
            <form action={saveCollection}>
              <CollectionFields careSheets={sheets} />
              <button className="btn" style={{ marginTop: 16 }}>Create collection</button>
            </form>
          </div>
        </section>

        <section className="admin-section" id="classes">
          <div className="toolbar">
            <div>
              <h2>In-person and online classes</h2>
              <p className="muted">Paid classes use Stripe. Free classes use the website signup form. Online customers receive a private Telnyx classroom link by email.</p>
            </div>
            {CLASSES_PUBLICLY_VISIBLE ? (
              <Link className="btn outline small" href="/classes">View public classes</Link>
            ) : (
              <p className="muted">The public classes page is hidden from customers. Classes stay editable here.</p>
            )}
          </div>
          {!telnyxReady && (
            <div className="admin-card telnyx-setup-warning">
              <b>Telnyx Video needs one Railway variable.</b>
              <p>Add <code>TELNYX_API_KEY</code> to the Hillside web service before publishing an online class. Class content can still be saved now.</p>
            </div>
          )}
          <div className="admin-list">
            {classes.map((event) => {
              const online = isOnlineClass(event.format);
              return (
                <details
                  key={event.id}
                  id={`class-${event.id}`}
                  open={focusItem === event.id}
                >
                  <summary>
                    <span>{event.title} • {classFormatLabel(event.format)} • {event.startsAt.toLocaleString()}</span>
                    <span className={`status-badge ${event.active ? 'PAID' : 'CANCELLED'}`}>{event.active ? 'Published' : 'Archived'}</span>
                  </summary>
                  <div>
                    {online && (
                      <div className="telnyx-room-status">
                        <span><b>Telnyx room:</b> {event.telnyxRoomId ? 'Prepared' : 'Not prepared yet'}</span>
                        <span><b>Recording:</b> {event.telnyxRecordingEnabled ? 'Enabled' : 'Off'}</span>
                      </div>
                    )}
                    <form action={saveClassEvent}>
                      <ClassFields event={event} />
                      <div className="admin-actions">
                        <button className="btn small">Save class</button>
                        {online && <Link className="btn outline small" href={`/admin/classes/${event.id}/studio`}>Open host studio</Link>}
                      </div>
                    </form>
                    {online && (
                      <form action={prepareClassRoom} style={{ marginTop: 10 }}>
                        <input type="hidden" name="id" value={event.id} />
                        <button className="text-button">Prepare or repair Telnyx room</button>
                      </form>
                    )}
                    {event.active && (
                      <form action={archiveContent} style={{ marginTop: 10 }}>
                        <input type="hidden" name="id" value={event.id} />
                        <input type="hidden" name="kind" value="class" />
                        <ConfirmSubmit
                          className="text-button danger"
                          message={`Archive “${event.title}”? It will leave the public classes page.`}
                        >
                          Archive class
                        </ConfirmSubmit>
                      </form>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
          <div className="admin-card" id="add-class" style={{ marginTop: 20 }}>
            <h2 style={{ marginTop: 0 }}>Add a class</h2>
            <p className="muted">Choose Online or Hybrid to automatically prepare a private Telnyx Video room.</p>
            <form action={saveClassEvent}><ClassFields /><button className="btn" style={{ marginTop: 16 }}>Publish class</button></form>
          </div>
        </section>

        <section className="admin-section" id="gallery">
          <div className="toolbar"><div><h2>Planter gallery</h2><p className="muted">Use our real arrangement photos and a short helpful caption.</p></div><Link className="btn outline small" href="/gallery">View gallery</Link></div>
          <div className="admin-list">
            {gallery.map((item) => (
              <details key={item.id} id={`gallery-${item.id}`} open={focusItem === item.id}><summary><span>{item.title}</span><span className="status-badge PAID">Published</span></summary><div><form action={saveGalleryItem}><GalleryFields item={item} /><div className="admin-actions"><button className="btn small">Save gallery item</button></div></form><form action={archiveContent} style={{ marginTop: 10 }}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="kind" value="gallery" /><ConfirmSubmit className="text-button danger" message={`Delete “${item.title}” from the gallery? This cannot be undone.`}>Delete gallery photo</ConfirmSubmit></form></div></details>
            ))}
          </div>
          <div className="admin-card" id="add-gallery" style={{ marginTop: 20 }}><h2 style={{ marginTop: 0 }}>Add a gallery arrangement</h2><form action={saveGalleryItem}><GalleryFields /><button className="btn" style={{ marginTop: 16 }}>Add to gallery</button></form></div>
        </section>

        <section className="admin-section" id="amazon">
          <div className="toolbar"><div><h2>Amazon influencer picks</h2><p className="muted">Paste the link, and the item is on the page. The affiliate disclosure stays visible to customers.</p></div><Link className="btn outline small" href="/amazon">View our Picks</Link></div>
          <div className="admin-card" id="add-amazon">
            <h2 style={{ marginTop: 0 }}>Add a pick</h2>
            <p className="muted">
              Paste the item&rsquo;s address from Amazon — the long one in the address bar, or the
              short a.co link the Amazon app shares. The name, photograph and department come off
              the item page; you can edit any of it afterwards.
            </p>
            <form action={addAmazonPickByUrl} className="admin-url-form">
              <label className="admin-label">
                Amazon link
                <input
                  className="admin-input"
                  name="amazonUrl"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://www.amazon.com/dp/B01N5IB20Q"
                  required
                />
              </label>
              <PendingSubmit className="btn" pendingLabel="Reading the item…">Add to the picks page</PendingSubmit>
            </form>
          </div>
          <div className="admin-list" style={{ marginTop: 20 }}>
            {picks.length === 0 && <p className="muted">Nothing here yet. Paste a link above and it appears on the page.</p>}
            {picks.map((item) => (
              <details key={item.id} id={`amazon-${item.id}`} open={focusItem === item.id}>
                <summary><span>{item.title}</span><span className="admin-badges">{!item.imageUrl && <span className="status-badge">No photo</span>}<span className={`status-badge ${item.active ? 'PAID' : 'CANCELLED'}`}>{item.active ? 'Published' : 'Archived'}</span></span></summary>
                <div>
                  {/* A lookup can come back empty — Amazon does refuse servers it does
                      not recognise — so this is the second try, without making Tammy
                      go and find the photograph herself. */}
                  <form action={fillAmazonPickFromLink}>
                    <input type="hidden" name="id" value={item.id} />
                    <div className="admin-actions" style={{ marginTop: 0 }}>
                      <PendingSubmit className="btn outline small" pendingLabel="Asking Amazon…">Get details from Amazon</PendingSubmit>
                      <span className="muted">Fills in whatever is still blank. Anything you wrote yourself is kept.</span>
                    </div>
                  </form>
                  <form action={saveAmazonPick}><AmazonFields item={item} /><div className="admin-actions"><button className="btn small">Save Amazon pick</button></div></form>
                  {item.active && <form action={archiveContent} style={{ marginTop: 10 }}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="kind" value="amazon" /><ConfirmSubmit className="text-button danger" message={`Archive “${item.title}”? It will leave the public picks page.`}>Archive pick</ConfirmSubmit></form>}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="admin-section" id="care">
          <div className="toolbar">
            <div>
              <h2>Plant care library</h2>
              <p className="muted">
                Guides are edited in the care library manager so plant profiles, problem guides and
                seasonal checklists stay one form. Unpublish here if you only need to take a sheet
                off the public library.
              </p>
            </div>
            <div className="admin-actions">
              <Link className="btn" href="/admin/care">Open care library</Link>
              <Link className="btn outline small" href="/admin/care#new-guide">Add a guide</Link>
            </div>
          </div>
          <div className="admin-list">
            {sheets.map((sheet) => (
              <details key={sheet.id} id={`care-${sheet.id}`} open={focusItem === sheet.id}>
                <summary>
                  <span>
                    {sheet.plantName}
                    {sheet.botanical ? ` • ${sheet.botanical}` : ''} • {careGuideTypeLabel(sheet.guideType)}
                  </span>
                  <span className={`status-badge ${sheet.published ? 'PAID' : 'CANCELLED'}`}>
                    {sheet.published ? 'Published' : 'Draft'}
                  </span>
                </summary>
                <div>
                  <p className="muted" style={{ marginTop: 0 }}>
                    {sheet.category ? `${sheet.category} • ` : ''}
                    {sheet.summary}
                  </p>
                  <div className="admin-actions">
                    <Link className="btn small" href={`/admin/care?edit=${encodeURIComponent(sheet.slug)}`}>
                      Edit guide
                    </Link>
                    <Link className="btn outline small" href={`/care/${sheet.slug}`}>
                      View guide
                    </Link>
                  </div>
                  {sheet.published && (
                    <form action={archiveContent} style={{ marginTop: 10 }}>
                      <input type="hidden" name="id" value={sheet.id} />
                      <input type="hidden" name="kind" value="care" />
                      <ConfirmSubmit
                        className="text-button danger"
                        message={`Unpublish “${sheet.plantName}”? It will leave the care library.`}
                      >
                        Unpublish guide
                      </ConfirmSubmit>
                    </form>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
