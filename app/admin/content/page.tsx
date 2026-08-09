import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { AmazonPick, CareSheet, ClassEvent, GalleryItem } from '@prisma/client';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import {
  archiveContent,
  saveAmazonPick,
  saveCareSheet,
  saveClassEvent,
  saveGalleryItem
} from '../actions';

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
        <label className="admin-label full">Description<textarea className="admin-input" name="description" rows={4} defaultValue={event?.description} required /></label>
        <label className="admin-label">Date and time<input className="admin-input" name="startsAt" type="datetime-local" defaultValue={localDateTime(event?.startsAt)} required /></label>
        <label className="admin-label">Registration deadline<input className="admin-input" name="registrationDeadline" type="datetime-local" defaultValue={localDateTime(event?.registrationDeadline)} /></label>
        <label className="admin-label">Location<input className="admin-input" name="location" defaultValue={event?.location} required /></label>
        <label className="admin-label">Price per person<input className="admin-input" name="price" type="number" min="0" step="0.01" defaultValue={event ? (event.priceCents / 100).toFixed(2) : ''} required /></label>
        <label className="admin-label">Total seats<input className="admin-input" name="capacity" type="number" min="1" defaultValue={event?.capacity ?? 12} required /></label>
        <label className="admin-label">Duration in minutes<input className="admin-input" name="durationMinutes" type="number" min="15" step="15" defaultValue={event?.durationMinutes ?? 90} /></label>
        <label className="admin-label full">What to bring / what is included<textarea className="admin-input" name="whatToBring" rows={2} defaultValue={event?.whatToBring || ''} /></label>
        <label className="admin-label full">Photo URL<input className="admin-input" name="imageUrl" type="url" defaultValue={event?.imageUrl || ''} /></label>
      </div>
      <label className="admin-checkbox" style={{ marginTop: 12 }}><input name="active" type="checkbox" defaultChecked={event?.active ?? true} /> Published and open for registration</label>
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
        <label className="admin-label full">Photo URL<input className="admin-input" name="imageUrl" type="url" defaultValue={item?.imageUrl} required /></label>
        <label className="admin-label full">Caption<textarea className="admin-input" name="caption" rows={3} defaultValue={item?.caption || ''} /></label>
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
        <label className="admin-label full">Photo URL<input className="admin-input" name="imageUrl" type="url" defaultValue={item?.imageUrl || ''} /></label>
        <label className="admin-label full">Why Tammy recommends it<textarea className="admin-input" name="description" rows={3} defaultValue={item?.description || ''} /></label>
        <label className="admin-label">Display order<input className="admin-input" name="sortOrder" type="number" defaultValue={item?.sortOrder ?? 0} /></label>
      </div>
      <label className="admin-checkbox" style={{ marginTop: 12 }}><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /> Show on public page</label>
    </>
  );
}

function CareFields({ sheet }: { sheet?: CareSheet }) {
  return (
    <>
      {sheet && <input type="hidden" name="id" value={sheet.id} />}
      <div className="admin-form-grid">
        <label className="admin-label">Plant name<input className="admin-input" name="plantName" defaultValue={sheet?.plantName} required /></label>
        <label className="admin-label">URL slug<input className="admin-input" name="slug" defaultValue={sheet?.slug} placeholder="created-from-name" /></label>
        <label className="admin-label">Botanical name<input className="admin-input" name="botanical" defaultValue={sheet?.botanical || ''} /></label>
        <label className="admin-label">Photo URL<input className="admin-input" name="imageUrl" type="url" defaultValue={sheet?.imageUrl || ''} /></label>
        <label className="admin-label full">Short introduction<textarea className="admin-input" name="summary" rows={3} defaultValue={sheet?.summary} required /></label>
        <label className="admin-label">Light<input className="admin-input" name="light" defaultValue={sheet?.light} required /></label>
        <label className="admin-label">Water<input className="admin-input" name="water" defaultValue={sheet?.water} required /></label>
        <label className="admin-label">Humidity<input className="admin-input" name="humidity" defaultValue={sheet?.humidity} required /></label>
        <label className="admin-label">Soil<input className="admin-input" name="soil" defaultValue={sheet?.soil} required /></label>
        <label className="admin-label">Feeding<input className="admin-input" name="feeding" defaultValue={sheet?.feeding} required /></label>
        <label className="admin-label">Temperature<input className="admin-input" name="temperature" defaultValue={sheet?.temperature} required /></label>
        <label className="admin-label full">Pet safety<input className="admin-input" name="petSafety" defaultValue={sheet?.petSafety || ''} /></label>
        <label className="admin-label full">Tammy’s best tips<textarea className="admin-input" name="tips" rows={4} defaultValue={sheet?.tips} required /></label>
      </div>
      <label className="admin-checkbox" style={{ marginTop: 12 }}><input name="published" type="checkbox" defaultChecked={sheet?.published ?? true} /> Published in care library</label>
    </>
  );
}

export default async function ContentManager() {
  if (!(await isAdmin())) redirect('/admin');
  const [classes, gallery, picks, sheets] = await Promise.all([
    db.classEvent.findMany({ orderBy: { startsAt: 'desc' } }),
    db.galleryItem.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] }),
    db.amazonPick.findMany({ orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { title: 'asc' }] }),
    db.careSheet.findMany({ orderBy: [{ published: 'desc' }, { plantName: 'asc' }] })
  ]);

  return (
    <div className="adminshell">
      <aside className="sidebar">
        <img src="/logo.svg" alt="The Hillside Gardens" />
        <b>Website Content Manager</b>
        <Link href="/admin">← Business dashboard</Link>
        <a href="#classes">Classes</a>
        <a href="#gallery">Gallery</a>
        <a href="#amazon">Amazon picks</a>
        <a href="#care">Plant care sheets</a>
        <Link href="/">View public website</Link>
      </aside>
      <main className="adminmain">
        <div className="eyebrow">Easy website editor</div>
        <h1>Website content</h1>
        <p className="muted">Use the forms below to publish and update content without changing code.</p>
        <div className="statgrid">
          <div className="stat"><span>Classes</span><strong>{classes.filter((item) => item.active).length}</strong></div>
          <div className="stat"><span>Gallery photos</span><strong>{gallery.length}</strong></div>
          <div className="stat"><span>Amazon picks</span><strong>{picks.filter((item) => item.active).length}</strong></div>
          <div className="stat"><span>Published care sheets</span><strong>{sheets.filter((item) => item.published).length}</strong></div>
        </div>

        <section className="admin-section" id="classes">
          <div className="toolbar"><div><h2>Planter classes</h2><p className="muted">Classes with a price above $0 can be reserved and paid through Stripe.</p></div><Link className="btn outline small" href="/classes">View public classes</Link></div>
          <div className="admin-list">
            {classes.map((event) => (
              <details key={event.id}>
                <summary><span>{event.title} • {event.startsAt.toLocaleString()}</span><span className={`status-badge ${event.active ? 'PAID' : 'CANCELLED'}`}>{event.active ? 'Published' : 'Archived'}</span></summary>
                <div>
                  <form action={saveClassEvent}><ClassFields event={event} /><div className="admin-actions"><button className="btn small">Save class</button></div></form>
                  {event.active && <form action={archiveContent} style={{ marginTop: 10 }}><input type="hidden" name="id" value={event.id} /><input type="hidden" name="kind" value="class" /><button className="text-button danger">Archive class</button></form>}
                </div>
              </details>
            ))}
          </div>
          <div className="admin-card" style={{ marginTop: 20 }}><h2 style={{ marginTop: 0 }}>Add a class</h2><form action={saveClassEvent}><ClassFields /><button className="btn" style={{ marginTop: 16 }}>Publish class</button></form></div>
        </section>

        <section className="admin-section" id="gallery">
          <div className="toolbar"><div><h2>Planter gallery</h2><p className="muted">Use Tammy’s real arrangement photos and a short helpful caption.</p></div><Link className="btn outline small" href="/gallery">View gallery</Link></div>
          <div className="admin-list">
            {gallery.map((item) => (
              <details key={item.id}><summary><span>{item.title}</span><span className="status-badge PAID">Published</span></summary><div><form action={saveGalleryItem}><GalleryFields item={item} /><div className="admin-actions"><button className="btn small">Save gallery item</button></div></form><form action={archiveContent} style={{ marginTop: 10 }}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="kind" value="gallery" /><button className="text-button danger">Delete gallery photo</button></form></div></details>
            ))}
          </div>
          <div className="admin-card" style={{ marginTop: 20 }}><h2 style={{ marginTop: 0 }}>Add a gallery arrangement</h2><form action={saveGalleryItem}><GalleryFields /><button className="btn" style={{ marginTop: 16 }}>Add to gallery</button></form></div>
        </section>

        <section className="admin-section" id="amazon">
          <div className="toolbar"><div><h2>Amazon influencer picks</h2><p className="muted">Affiliate disclosure remains visible on the public page.</p></div><Link className="btn outline small" href="/amazon">View Tammy’s Picks</Link></div>
          <div className="admin-list">
            {picks.map((item) => (
              <details key={item.id}><summary><span>{item.title}</span><span className={`status-badge ${item.active ? 'PAID' : 'CANCELLED'}`}>{item.active ? 'Published' : 'Archived'}</span></summary><div><form action={saveAmazonPick}><AmazonFields item={item} /><div className="admin-actions"><button className="btn small">Save Amazon pick</button></div></form>{item.active && <form action={archiveContent} style={{ marginTop: 10 }}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="kind" value="amazon" /><button className="text-button danger">Archive pick</button></form>}</div></details>
            ))}
          </div>
          <div className="admin-card" style={{ marginTop: 20 }}><h2 style={{ marginTop: 0 }}>Add an Amazon pick</h2><form action={saveAmazonPick}><AmazonFields /><button className="btn" style={{ marginTop: 16 }}>Publish pick</button></form></div>
        </section>

        <section className="admin-section" id="care">
          <div className="toolbar"><div><h2>Plant care sheets</h2><p className="muted">Each published plant receives a searchable detail page and print-friendly care sheet.</p></div><Link className="btn outline small" href="/care">View care library</Link></div>
          <div className="admin-list">
            {sheets.map((sheet) => (
              <details key={sheet.id}><summary><span>{sheet.plantName}{sheet.botanical ? ` • ${sheet.botanical}` : ''}</span><span className={`status-badge ${sheet.published ? 'PAID' : 'CANCELLED'}`}>{sheet.published ? 'Published' : 'Draft'}</span></summary><div><form action={saveCareSheet}><CareFields sheet={sheet} /><div className="admin-actions"><button className="btn small">Save care sheet</button><Link className="btn outline small" href={`/care/${sheet.slug}`}>View guide</Link></div></form>{sheet.published && <form action={archiveContent} style={{ marginTop: 10 }}><input type="hidden" name="id" value={sheet.id} /><input type="hidden" name="kind" value="care" /><button className="text-button danger">Unpublish care sheet</button></form>}</div></details>
            ))}
          </div>
          <div className="admin-card" style={{ marginTop: 20 }}><h2 style={{ marginTop: 0 }}>Add a plant care sheet</h2><form action={saveCareSheet}><CareFields /><button className="btn" style={{ marginTop: 16 }}>Publish care sheet</button></form></div>
        </section>
      </main>
    </div>
  );
}
