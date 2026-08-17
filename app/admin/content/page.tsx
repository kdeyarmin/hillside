import '../../classroom.css';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { AmazonPick, CareSheet, ClassEvent, Collection, GalleryItem } from '@prisma/client';
import { ClassFormat } from '@prisma/client';
import { isAdmin } from '@/lib/admin';
import { classFormatLabel, isOnlineClass } from '@/lib/class-access';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { db } from '@/lib/db';
import { telnyxVideoConfigured } from '@/lib/telnyx-video';
import {
  archiveContent,
  deleteCollection,
  prepareClassRoom,
  saveAmazonPick,
  saveCareSheet,
  saveClassEvent,
  saveCollection,
  saveGalleryItem
} from '../actions';

function CollectionFields({ collection }: { collection?: Collection }) {
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
      </div>
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
        <label className="admin-label full">Amazon affiliate URL<input className="admin-input" name="amazonUrl" type="url" defaultValue={item?.amazonUrl} required /></label>
        <label className="admin-label full">Photo URL<input className="admin-input" name="imageUrl" type="text" defaultValue={item?.imageUrl || ''} /></label>
        <label className="admin-label full">Why we recommend it<textarea className="admin-input" name="description" rows={3} defaultValue={item?.description || ''} /></label>
        <label className="admin-label">Display order<input className="admin-input" name="sortOrder" type="number" defaultValue={item?.sortOrder ?? 0} /></label>
      </div>
      <label className="admin-checkbox" style={{ marginTop: 12 }}><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /> Show on public page</label>
    </>
  );
}

function CareFields({
  sheet,
  products
}: {
  sheet?: CareSheet;
  products: Array<{ id: string; name: string; active: boolean }>;
}) {
  return (
    <>
      {sheet && <input type="hidden" name="id" value={sheet.id} />}
      <div className="admin-form-grid">
        <label className="admin-label">Plant name<input className="admin-input" name="plantName" defaultValue={sheet?.plantName} required /></label>
        <label className="admin-label">URL slug<input className="admin-input" name="slug" defaultValue={sheet?.slug} placeholder="created-from-name" /></label>
        <label className="admin-label">Botanical name<input className="admin-input" name="botanical" defaultValue={sheet?.botanical || ''} /></label>
        <label className="admin-label">Photo URL<input className="admin-input" name="imageUrl" type="text" defaultValue={sheet?.imageUrl || ''} /></label>
        <label className="admin-label full">Short introduction<textarea className="admin-input" name="summary" rows={3} defaultValue={sheet?.summary} required /></label>
        <label className="admin-label">Light<input className="admin-input" name="light" defaultValue={sheet?.light} /></label>
        <label className="admin-label">Water<input className="admin-input" name="water" defaultValue={sheet?.water} /></label>
        <label className="admin-label">Humidity<input className="admin-input" name="humidity" defaultValue={sheet?.humidity} /></label>
        <label className="admin-label">Soil<input className="admin-input" name="soil" defaultValue={sheet?.soil} /></label>
        <label className="admin-label">Feeding<input className="admin-input" name="feeding" defaultValue={sheet?.feeding} /></label>
        <label className="admin-label">Temperature<input className="admin-input" name="temperature" defaultValue={sheet?.temperature} /></label>
        <label className="admin-label full">Pet safety<input className="admin-input" name="petSafety" defaultValue={sheet?.petSafety || ''} /></label>
        <label className="admin-label full">Our best tips<textarea className="admin-input" name="tips" rows={4} defaultValue={sheet?.tips} /></label>
        <label className="admin-label full">
          Sell this plant on the guide
          <select className="admin-input" name="productId" defaultValue={sheet?.productId || ''}>
            <option value="">No product — show current plants instead</option>
            {products.map((product) => (
              <option value={product.id} key={product.id}>
                {product.name}{product.active ? '' : ' (archived)'}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="admin-checkbox" style={{ marginTop: 12 }}><input name="published" type="checkbox" defaultChecked={sheet?.published ?? true} /> Published in care library</label>
    </>
  );
}

export default async function ContentManager() {
  if (!(await isAdmin())) redirect('/admin');
  const [classes, gallery, picks, sheets, products, collections] = await Promise.all([
    db.classEvent.findMany({ orderBy: { startsAt: 'desc' } }),
    db.galleryItem.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] }),
    db.amazonPick.findMany({ orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { title: 'asc' }] }),
    db.careSheet.findMany({ orderBy: [{ published: 'desc' }, { plantName: 'asc' }] }),
    db.product.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { id: true, name: true, active: true } }),
    db.collection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: { _count: { select: { products: { where: { active: true } } } } }
    })
  ]);
  const telnyxReady = telnyxVideoConfigured();

  return (
    <div className="adminshell">
      <aside className="sidebar">
        <img src="/logo.webp" alt="The Hillside Gardens" />
        <b>Website Content Manager</b>
        <Link href="/admin">← Business dashboard</Link>
        <a href="#collections">Collections</a>
        <a href="#classes">Classes</a>
        <a href="#gallery">Gallery</a>
        <a href="#amazon">Amazon picks</a>
        <a href="#care">Plant care sheets</a>
        <Link href="/">View public website</Link>
      </aside>
      <div className="adminmain">
        <div className="eyebrow">Easy website editor</div>
        <h1>Website content</h1>
        <p className="muted">Use the forms below to publish and update content without changing code.</p>
        <div className="statgrid">
          <div className="stat"><span>Classes</span><strong>{classes.filter((item) => item.active).length}</strong></div>
          <div className="stat"><span>Online classes</span><strong>{classes.filter((item) => item.active && isOnlineClass(item.format)).length}</strong></div>
          <div className="stat"><span>Gallery photos</span><strong>{gallery.length}</strong></div>
          <div className="stat"><span>Amazon picks</span><strong>{picks.filter((item) => item.active).length}</strong></div>
          <div className="stat"><span>Care sheets</span><strong>{sheets.filter((item) => item.published).length}</strong></div>
          <div className="stat"><span>Collections</span><strong>{collections.filter((item) => item.active).length}</strong></div>
          <div className="stat"><span>Telnyx Video</span><strong>{telnyxReady ? 'Ready' : 'Setup'}</strong></div>
        </div>

        <section className="admin-section" id="collections">
          <h2>Collections</h2>
          <p className="muted">
            Collections are how the website groups what you sell. A collection only appears on the
            homepage once it holds at least one active product — assign products from the
            <Link className="text-link" href="/admin#inventory"> inventory section</Link> of the business dashboard.
          </p>
          <div className="admin-list">
            {collections.map((collection) => (
              <details key={collection.id}>
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
                    <CollectionFields collection={collection} />
                    <div className="admin-actions">
                      <button className="btn small">Save collection</button>
                      <Link className="btn outline small" href={`/collections/${collection.slug}`}>View collection</Link>
                    </div>
                  </form>
                  <form action={deleteCollection} style={{ marginTop: 10 }}>
                    <input type="hidden" name="id" value={collection.id} />
                    <button className="text-button danger">Delete collection</button>
                  </form>
                </div>
              </details>
            ))}
          </div>
          <div className="admin-card" style={{ marginTop: 20 }}>
            <h2 style={{ marginTop: 0 }}>Add a collection</h2>
            <form action={saveCollection}>
              <CollectionFields />
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
                <details key={event.id}>
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
                    {event.active && <form action={archiveContent} style={{ marginTop: 10 }}><input type="hidden" name="id" value={event.id} /><input type="hidden" name="kind" value="class" /><button className="text-button danger">Archive class</button></form>}
                  </div>
                </details>
              );
            })}
          </div>
          <div className="admin-card" style={{ marginTop: 20 }}>
            <h2 style={{ marginTop: 0 }}>Add a class</h2>
            <p className="muted">Choose Online or Hybrid to automatically prepare a private Telnyx Video room.</p>
            <form action={saveClassEvent}><ClassFields /><button className="btn" style={{ marginTop: 16 }}>Publish class</button></form>
          </div>
        </section>

        <section className="admin-section" id="gallery">
          <div className="toolbar"><div><h2>Planter gallery</h2><p className="muted">Use our real arrangement photos and a short helpful caption.</p></div><Link className="btn outline small" href="/gallery">View gallery</Link></div>
          <div className="admin-list">
            {gallery.map((item) => (
              <details key={item.id}><summary><span>{item.title}</span><span className="status-badge PAID">Published</span></summary><div><form action={saveGalleryItem}><GalleryFields item={item} /><div className="admin-actions"><button className="btn small">Save gallery item</button></div></form><form action={archiveContent} style={{ marginTop: 10 }}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="kind" value="gallery" /><button className="text-button danger">Delete gallery photo</button></form></div></details>
            ))}
          </div>
          <div className="admin-card" style={{ marginTop: 20 }}><h2 style={{ marginTop: 0 }}>Add a gallery arrangement</h2><form action={saveGalleryItem}><GalleryFields /><button className="btn" style={{ marginTop: 16 }}>Add to gallery</button></form></div>
        </section>

        <section className="admin-section" id="amazon">
          <div className="toolbar"><div><h2>Amazon influencer picks</h2><p className="muted">Affiliate disclosure remains visible on the public page.</p></div><Link className="btn outline small" href="/amazon">View our Picks</Link></div>
          <div className="admin-list">
            {picks.map((item) => (
              <details key={item.id}><summary><span>{item.title}</span><span className={`status-badge ${item.active ? 'PAID' : 'CANCELLED'}`}>{item.active ? 'Published' : 'Archived'}</span></summary><div><form action={saveAmazonPick}><AmazonFields item={item} /><div className="admin-actions"><button className="btn small">Save Amazon pick</button></div></form>{item.active && <form action={archiveContent} style={{ marginTop: 10 }}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="kind" value="amazon" /><button className="text-button danger">Archive pick</button></form>}</div></details>
            ))}
          </div>
          <div className="admin-card" style={{ marginTop: 20 }}><h2 style={{ marginTop: 0 }}>Add an Amazon pick</h2><form action={saveAmazonPick}><AmazonFields /><button className="btn" style={{ marginTop: 16 }}>Publish pick</button></form></div>
        </section>

        <section className="admin-section" id="care">
          <div className="toolbar"><div><h2>Plant care sheets</h2><p className="muted">Each published plant receives a searchable detail page and print-friendly care sheet. Problem and seasonal guides are easier to edit in the full <Link className="text-link" href="/admin/care">care library manager</Link>.</p></div><Link className="btn outline small" href="/admin/care">Open care library manager</Link></div>
          <div className="admin-list">
            {sheets.map((sheet) => (
              <details key={sheet.id}><summary><span>{sheet.plantName}{sheet.botanical ? ` • ${sheet.botanical}` : ''}</span><span className={`status-badge ${sheet.published ? 'PAID' : 'CANCELLED'}`}>{sheet.published ? 'Published' : 'Draft'}</span></summary><div><form action={saveCareSheet}><CareFields sheet={sheet} products={products} /><div className="admin-actions"><button className="btn small">Save care sheet</button><Link className="btn outline small" href={`/care/${sheet.slug}`}>View guide</Link></div></form>{sheet.published && <form action={archiveContent} style={{ marginTop: 10 }}><input type="hidden" name="id" value={sheet.id} /><input type="hidden" name="kind" value="care" /><button className="text-button danger">Unpublish care sheet</button></form>}</div></details>
            ))}
          </div>
          <div className="admin-card" style={{ marginTop: 20 }}><h2 style={{ marginTop: 0 }}>Add a plant care sheet</h2><form action={saveCareSheet}><CareFields products={products} /><button className="btn" style={{ marginTop: 16 }}>Publish care sheet</button></form></div>
        </section>
      </div>
    </div>
  );
}
