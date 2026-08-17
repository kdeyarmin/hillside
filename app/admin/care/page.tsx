import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CareGuideType, type CareSheet } from '@prisma/client';
import { isAdmin } from '@/lib/admin';
import { careGuideTypeLabel, starterCareGuides } from '@/lib/care-seed-data';
import { db } from '@/lib/db';
import {
  saveCareGuide,
  seedStarterCareLibrary,
  setCareGuidePublished
} from '../care-actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plant Care Library Manager' };

function CareGuideFields({
  guide,
  products
}: {
  guide?: CareSheet;
  products: Array<{ id: string; name: string; active: boolean }>;
}) {
  return (
    <>
      {guide && <input type="hidden" name="id" value={guide.id} />}
      <div className="admin-form-grid">
        <label className="admin-label">Guide title
          <input
            className="admin-input"
            name="plantName"
            defaultValue={guide?.plantName || ''}
            placeholder="Monstera Deliciosa or Why Are My Leaves Yellow?"
            required
          />
        </label>
        <label className="admin-label">Guide type
          <select className="admin-input" name="guideType" defaultValue={guide?.guideType || CareGuideType.PLANT}>
            <option value={CareGuideType.PLANT}>Plant profile</option>
            <option value={CareGuideType.GENERAL}>Plant care basics</option>
            <option value={CareGuideType.PROBLEM}>Common issue / plant problem</option>
            <option value={CareGuideType.SEASONAL}>Seasonal care</option>
          </select>
        </label>
        <label className="admin-label">Category
          <input className="admin-input" name="category" defaultValue={guide?.category || ''} placeholder="Trailing plants, Pests, Watering" />
        </label>
        <label className="admin-label">Difficulty or label
          <input className="admin-input" name="difficulty" defaultValue={guide?.difficulty || ''} placeholder="Beginner friendly, Common issue" />
        </label>
        <label className="admin-label">URL slug
          <input className="admin-input" name="slug" defaultValue={guide?.slug || ''} placeholder="created-from-title" />
        </label>
        <label className="admin-label">Botanical name
          <input className="admin-input" name="botanical" defaultValue={guide?.botanical || ''} placeholder="Optional; usually for a plant profile" />
        </label>
        <label className="admin-label">Display order
          <input className="admin-input" name="sortOrder" type="number" defaultValue={guide?.sortOrder ?? 0} />
        </label>
        <label className="admin-label">Photo URL
          <input className="admin-input" name="imageUrl" type="text" defaultValue={guide?.imageUrl || ''} />
        </label>
        <label className="admin-label full">Sell this plant on the guide
          <select className="admin-input" name="productId" defaultValue={guide?.productId || ''}>
            <option value="">No product — show current plants instead</option>
            {products.map((product) => (
              <option value={product.id} key={product.id}>
                {product.name}{product.active ? '' : ' (archived)'}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-label full">Short introduction
          <textarea className="admin-input" name="summary" rows={3} defaultValue={guide?.summary || ''} required />
        </label>
      </div>

      <div className="admin-card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Plant profile details</h3>
        <p className="muted">Fill these out for a specific plant. They can be left blank for general, problem and seasonal guides.</p>
        <div className="admin-form-grid">
          <label className="admin-label">Light<textarea className="admin-input" name="light" rows={2} defaultValue={guide?.light || ''} /></label>
          <label className="admin-label">Water<textarea className="admin-input" name="water" rows={2} defaultValue={guide?.water || ''} /></label>
          <label className="admin-label">Humidity<textarea className="admin-input" name="humidity" rows={2} defaultValue={guide?.humidity || ''} /></label>
          <label className="admin-label">Soil<textarea className="admin-input" name="soil" rows={2} defaultValue={guide?.soil || ''} /></label>
          <label className="admin-label">Feeding<textarea className="admin-input" name="feeding" rows={2} defaultValue={guide?.feeding || ''} /></label>
          <label className="admin-label">Temperature<textarea className="admin-input" name="temperature" rows={2} defaultValue={guide?.temperature || ''} /></label>
          <label className="admin-label full">Pet and child safety<textarea className="admin-input" name="petSafety" rows={3} defaultValue={guide?.petSafety || ''} /></label>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Troubleshooting details</h3>
        <p className="muted">These sections turn a guide into a practical diagnostic resource. They also work well for the common-problems section of a plant profile.</p>
        <div className="admin-form-grid">
          <label className="admin-label full">What customers may notice<textarea className="admin-input" name="symptoms" rows={3} defaultValue={guide?.symptoms || ''} /></label>
          <label className="admin-label full">Likely causes<textarea className="admin-input" name="causes" rows={3} defaultValue={guide?.causes || ''} /></label>
          <label className="admin-label full">What to do now<textarea className="admin-input" name="treatment" rows={4} defaultValue={guide?.treatment || ''} /></label>
          <label className="admin-label full">How to prevent it<textarea className="admin-input" name="prevention" rows={3} defaultValue={guide?.prevention || ''} /></label>
        </div>
      </div>

      <div className="admin-form-grid" style={{ marginTop: 18 }}>
        <label className="admin-label full">Our main guidance
          <textarea className="admin-input" name="tips" rows={5} defaultValue={guide?.tips || ''} required />
        </label>
        <label className="admin-label full">Quick checklist — one item per line
          <textarea className="admin-input" name="checklist" rows={7} defaultValue={guide?.checklist || ''} placeholder={'Check soil moisture\nInspect leaf undersides\nReview recent changes'} />
        </label>
      </div>

      <div className="admin-actions">
        <label className="admin-checkbox"><input name="featured" type="checkbox" defaultChecked={guide?.featured ?? false} /> Feature this guide</label>
        <label className="admin-checkbox"><input name="published" type="checkbox" defaultChecked={guide?.published ?? true} /> Published in the public library</label>
      </div>
    </>
  );
}

export default async function CareLibraryManager({
  searchParams
}: {
  searchParams: Promise<{ seeded?: string; saved?: string }>;
}) {
  if (!(await isAdmin())) redirect('/admin');
  const params = await searchParams;
  const [guides, products] = await Promise.all([
    db.careSheet.findMany({
      orderBy: [
        { published: 'desc' },
        { guideType: 'asc' },
        { sortOrder: 'asc' },
        { plantName: 'asc' }
      ]
    }),
    db.product.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { id: true, name: true, active: true } })
  ]);

  const counts = Object.fromEntries(
    Object.values(CareGuideType).map((type) => [
      type,
      guides.filter((guide) => guide.guideType === type && guide.published).length
    ])
  ) as Record<CareGuideType, number>;

  return (
    <div className="adminshell">
      <aside className="sidebar">
        <img src="/logo.webp" alt="The Hillside Gardens" />
        <b>Plant Care Library</b>
        <Link href="/admin">← Business dashboard</Link>
        <Link href="/admin/content">Website content</Link>
        <a href="#starter-library">Starter library</a>
        <a href="#guides">Edit guides</a>
        <a href="#new-guide">Add a guide</a>
        <Link href="/care">View public care library</Link>
      </aside>

      <div className="adminmain">
        <div className="toolbar">
          <div>
            <div className="eyebrow">Our education center</div>
            <h1>Plant care library</h1>
            <p className="muted">Manage plant profiles, general care lessons, common problems and seasonal checklists.</p>
          </div>
          <Link className="btn" href="/care">View public library</Link>
        </div>

        {(params.seeded || params.saved) && (
          <div className="admin-card" style={{ borderColor: 'var(--success)', background: '#f2faf4' }}>
            <b>{params.seeded ? `${params.seeded} starter guides loaded or refreshed.` : 'Care guide saved.'}</b>
          </div>
        )}

        <div className="statgrid">
          <div className="stat"><span>Published total</span><strong>{guides.filter((guide) => guide.published).length}</strong></div>
          <div className="stat"><span>Plant profiles</span><strong>{counts.PLANT}</strong></div>
          <div className="stat"><span>Care basics</span><strong>{counts.GENERAL}</strong></div>
          <div className="stat"><span>Problem guides</span><strong>{counts.PROBLEM}</strong></div>
          <div className="stat"><span>Seasonal guides</span><strong>{counts.SEASONAL}</strong></div>
          <div className="stat"><span>Featured</span><strong>{guides.filter((guide) => guide.published && guide.featured).length}</strong></div>
        </div>

        <section className="admin-section" id="starter-library">
          <div className="care-admin-seed-card">
            <div>
              <div className="eyebrow">One-click starter content</div>
              <h2 style={{ margin: '5px 0 8px' }}>Load the complete starter care library.</h2>
              <p className="muted" style={{ margin: 0 }}>
                This safely creates or refreshes {starterCareGuides.length} professionally written guides covering common houseplants, core care skills, pests, root problems, leaf symptoms and seasonal care. It does not delete your additional guides.
              </p>
            </div>
            <form action={seedStarterCareLibrary}>
              <button className="btn gold">Load / refresh starter guides</button>
            </form>
          </div>
        </section>

        <section className="admin-section" id="guides">
          <div className="toolbar">
            <div>
              <h2>Published and draft guides</h2>
              <p className="muted">Open a guide to edit any part of it. Unpublishing removes it from customers without deleting it.</p>
            </div>
          </div>

          <div className="admin-list">
            {guides.map((guide) => (
              <details key={guide.id}>
                <summary>
                  <span>{guide.plantName} • {careGuideTypeLabel(guide.guideType)}</span>
                  <span className={`status-badge ${guide.published ? 'PAID' : 'CANCELLED'}`}>{guide.published ? 'Published' : 'Draft'}</span>
                </summary>
                <div>
                  <div className="care-admin-summary">
                    <span>{careGuideTypeLabel(guide.guideType)}</span>
                    {guide.category && <span>{guide.category}</span>}
                    {guide.difficulty && <span>{guide.difficulty}</span>}
                    {guide.featured && <span>Featured</span>}
                  </div>
                  <form action={saveCareGuide}>
                    <CareGuideFields guide={guide} products={products} />
                    <div className="admin-actions">
                      <button className="btn small">Save guide</button>
                      <Link className="btn outline small" href={`/care/${guide.slug}`}>View guide</Link>
                    </div>
                  </form>
                  <form action={setCareGuidePublished} style={{ marginTop: 10 }}>
                    <input type="hidden" name="id" value={guide.id} />
                    {!guide.published && <input type="hidden" name="published" value="true" />}
                    <button className={`text-button ${guide.published ? 'danger' : ''}`}>
                      {guide.published ? 'Move guide to draft' : 'Publish guide'}
                    </button>
                  </form>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="admin-section" id="new-guide">
          <div className="admin-card">
            <h2 style={{ marginTop: 0 }}>Add a new care guide</h2>
            <p className="muted">Choose a guide type and fill only the sections that apply.</p>
            <form action={saveCareGuide}>
              <CareGuideFields products={products} />
              <button className="btn" style={{ marginTop: 18 }}>Create guide</button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
