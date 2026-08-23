import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HomepageSectionKind, MerchandisingMode } from '@prisma/client';
import AdminDeepLink from '@/components/AdminDeepLink';
import AdminReorder from '@/components/AdminReorder';
import PendingSubmit from '@/components/PendingSubmit';
import { isAdmin } from '@/lib/admin';
import { ADMIN_ERRORS, ADMIN_NOTICES, firstSearchParam } from '@/lib/admin-dashboard';
import { db } from '@/lib/db';
import {
  BADGE_PRESETS,
  BEST_SELLER_MIN_ORDERS,
  BEST_SELLER_MIN_UNITS,
  BEST_SELLER_WINDOW_DAYS,
  HOMEPAGE_SECTION_KINDS,
  NEW_ARRIVAL_DAYS,
  homepageSectionKindLabel,
  isBestSeller,
  isInSeason,
  isNewArrival,
  qualifiesAsBestSeller
} from '@/lib/merchandising';
import { salesStats } from '@/lib/merchandising-data';
import { productTypeLabel } from '@/lib/store';
import {
  deleteHomepageSection,
  reorderCollections,
  reorderHomepageSections,
  reorderProducts,
  saveHomepageSection,
  updateCollectionFeature,
  updateProductMerchandising
} from '../merchandising-actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Merchandising' };

const MODE_LABELS: Array<[MerchandisingMode, string, string]> = [
  [MerchandisingMode.AUTO, 'Automatic', 'Let the shop decide from the numbers'],
  [MerchandisingMode.ALWAYS, 'Always show', 'Show the label whatever the numbers say'],
  [MerchandisingMode.NEVER, 'Never show', 'Never show this label on this product']
];

function SectionFields({
  section,
  collections
}: {
  collections: Array<{ id: string; title: string }>;
  section?: {
    id: string;
    kind: HomepageSectionKind;
    eyebrow: string | null;
    title: string;
    subtitle: string | null;
    maxItems: number;
    collectionId: string | null;
    active: boolean;
  };
}) {
  return (
    <>
      {section && <input type="hidden" name="id" value={section.id} />}
      <div className="admin-form-grid">
        <label className="admin-label">
          What this row shows
          <select
            className="admin-input"
            name="kind"
            defaultValue={section?.kind || HomepageSectionKind.FEATURED}
          >
            {HOMEPAGE_SECTION_KINDS.map((entry) => (
              <option value={entry.kind} key={entry.kind}>
                {entry.label}
              </option>
            ))}
          </select>
          <span className="admin-hint">
            {HOMEPAGE_SECTION_KINDS.map((entry) => `${entry.label}: ${entry.description}`).join(
              ' · '
            )}
          </span>
        </label>
        <label className="admin-label">
          Collection (only for a collection row)
          <select
            className="admin-input"
            name="collectionId"
            defaultValue={section?.collectionId || ''}
          >
            <option value="">No collection</option>
            {collections.map((collection) => (
              <option value={collection.id} key={collection.id}>
                {collection.title}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-label">
          Small line above the heading
          <input
            className="admin-input"
            name="eyebrow"
            defaultValue={section?.eyebrow || ''}
            placeholder="Loved by our customers"
          />
        </label>
        <label className="admin-label">
          Heading
          <input
            className="admin-input"
            name="title"
            defaultValue={section?.title || ''}
            placeholder="What is selling this season."
            required
          />
        </label>
        <label className="admin-label full">
          Sentence under the heading
          <input
            className="admin-input"
            name="subtitle"
            defaultValue={section?.subtitle || ''}
            placeholder="The plants going home with people most often right now."
          />
        </label>
        <label className="admin-label">
          How many to show
          <input
            className="admin-input"
            name="maxItems"
            type="number"
            min="2"
            max="8"
            defaultValue={section?.maxItems ?? 4}
          />
        </label>
      </div>
      <div className="admin-actions">
        <label className="admin-checkbox">
          <input name="active" type="checkbox" defaultChecked={section?.active ?? true} /> Show this
          row on the homepage
        </label>
      </div>
    </>
  );
}

export default async function Merchandising({
  searchParams
}: {
  searchParams: Promise<{
    notice?: string | string[];
    error?: string | string[];
    section?: string | string[];
    product?: string | string[];
  }>;
}) {
  if (!(await isAdmin())) redirect('/admin');
  const params = await searchParams;
  const notice = ADMIN_NOTICES[firstSearchParam(params.notice)];
  const errorMessage = ADMIN_ERRORS[firstSearchParam(params.error)];
  const focusSection = firstSearchParam(params.section);

  const [sections, collections, products, stats] = await Promise.all([
    db.homepageSection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { collection: { select: { title: true } } }
    }),
    db.collection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: { _count: { select: { products: { where: { active: true } } } } }
    }),
    db.product.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        badge: true,
        featured: true,
        staffPick: true,
        bestSellerMode: true,
        newArrivalMode: true,
        seasonStartsAt: true,
        seasonEndsAt: true,
        createdAt: true,
        sortOrder: true
      },
      take: 300
    }),
    salesStats()
  ]);

  const earnedBestSellers = products.filter((product) =>
    qualifiesAsBestSeller(stats.get(product.id))
  ).length;
  const showing = {
    featured: products.filter((product) => product.featured).length,
    staffPicks: products.filter((product) => product.staffPick).length,
    bestSellers: products.filter((product) => isBestSeller(product, stats.get(product.id))).length,
    newArrivals: products.filter((product) => isNewArrival(product)).length,
    inSeason: products.filter((product) => isInSeason(product)).length
  };

  return (
    <div className="adminshell">
      <AdminDeepLink section={focusSection || undefined} />
      <aside className="sidebar">
        <img src="/logo.webp" alt="The Hillside Gardens" />
        <b>Merchandising</b>
        <Link href="/admin">← Business dashboard</Link>
        <a href="#homepage">Homepage rows</a>
        <a href="#labels">Badges &amp; labels</a>
        <a href="#order">Product order</a>
        <a href="#collections">Featured collections</a>
        <Link href="/admin/content">Website content</Link>
        <Link href="/">View public website</Link>
      </aside>

      <div className="adminmain">
        <div className="eyebrow">What the shop puts in front of people</div>
        <h1>Merchandising</h1>
        <p className="muted">
          Arrange the homepage, decide which products carry a badge, and set the order things appear
          in — without touching prices, stock or anything a customer has already bought.
        </p>

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
          <div className="stat">
            <span>Homepage rows</span>
            <strong>{sections.filter((section) => section.active).length}</strong>
          </div>
          <div className="stat">
            <span>Featured</span>
            <strong>{showing.featured}</strong>
          </div>
          <div className="stat">
            <span>Best sellers</span>
            <strong>{showing.bestSellers}</strong>
          </div>
          <div className="stat">
            <span>Earned it from sales</span>
            <strong>{earnedBestSellers}</strong>
          </div>
          <div className="stat">
            <span>Tammy’s picks</span>
            <strong>{showing.staffPicks}</strong>
          </div>
          <div className="stat">
            <span>New arrivals</span>
            <strong>{showing.newArrivals}</strong>
          </div>
          <div className="stat">
            <span>In season now</span>
            <strong>{showing.inSeason}</strong>
          </div>
        </div>

        <section className="admin-section" id="homepage">
          <div className="toolbar">
            <div>
              <h2>Homepage rows</h2>
              <p className="muted">
                Each row is a strip on the front page. A row with nothing in it today is skipped
                rather than shown empty, so it is safe to leave a best-sellers row arranged through
                a quiet season.
              </p>
            </div>
            <Link className="btn outline small" href="/">
              View homepage
            </Link>
          </div>

          <div className="admin-card">
            <h3>Drag them into the order you want</h3>
            <AdminReorder
              action={reorderHomepageSections}
              label="Save homepage order"
              emptyMessage="No homepage rows yet. Add one below."
              items={sections.map((section) => ({
                id: section.id,
                label: section.title,
                note: `${homepageSectionKindLabel(section.kind)}${
                  section.collection ? ` · ${section.collection.title}` : ''
                }${section.active ? '' : ' · hidden'}`
              }))}
            />
          </div>

          {sections.map((section) => (
            <div className="admin-card" id={`homepage-${section.id}`} key={section.id}>
              <h3>
                {section.title}{' '}
                <span className="muted">({homepageSectionKindLabel(section.kind)})</span>
              </h3>
              <form action={saveHomepageSection}>
                <SectionFields section={section} collections={collections} />
                <div className="admin-actions">
                  <PendingSubmit className="btn small" pendingLabel="Saving…">
                    Save row
                  </PendingSubmit>
                </div>
              </form>
              <form action={deleteHomepageSection}>
                <input type="hidden" name="id" value={section.id} />
                <PendingSubmit className="text-button danger" pendingLabel="Removing…">
                  Remove this row
                </PendingSubmit>
              </form>
            </div>
          ))}

          <div className="admin-card" id="add-homepage-row">
            <h3>Add a homepage row</h3>
            <form action={saveHomepageSection}>
              <SectionFields collections={collections} />
              <div className="admin-actions">
                <PendingSubmit className="btn small" pendingLabel="Adding…">
                  Add row
                </PendingSubmit>
              </div>
            </form>
          </div>
        </section>

        <section className="admin-section" id="labels">
          <div className="toolbar">
            <div>
              <h2>Badges and labels</h2>
              <p className="muted">
                Best sellers are worked out from paid orders: at least {BEST_SELLER_MIN_UNITS} sold
                across {BEST_SELLER_MIN_ORDERS} separate orders in the last{' '}
                {BEST_SELLER_WINDOW_DAYS} days, so one big order cannot make something a best seller
                and the label lapses when a product stops selling. New arrivals are anything listed
                in the last {NEW_ARRIVAL_DAYS} days. Override either one whenever you know better.
              </p>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="admin-card">
              <p className="muted">No active products to merchandise yet.</p>
            </div>
          ) : (
            products.map((product) => {
              const stat = stats.get(product.id);
              const earned = qualifiesAsBestSeller(stat);
              return (
                <div className="admin-card" id={`product-${product.slug}`} key={product.id}>
                  <div className="toolbar">
                    <div>
                      <h3>{product.name}</h3>
                      <p className="muted">
                        {productTypeLabel(product.type)} ·{' '}
                        {stat
                          ? `${stat.units} sold in ${stat.orders} ${stat.orders === 1 ? 'order' : 'orders'} in the last ${BEST_SELLER_WINDOW_DAYS} days`
                          : `nothing sold in the last ${BEST_SELLER_WINDOW_DAYS} days`}
                        {earned ? ' · earns the best-seller badge' : ''}
                        {isNewArrival(product) ? ' · counts as new' : ''}
                        {isInSeason(product) ? ' · in season now' : ''}
                      </p>
                    </div>
                    <Link className="btn outline small" href={`/shop/${product.slug}`}>
                      View
                    </Link>
                  </div>
                  <form action={updateProductMerchandising}>
                    <input type="hidden" name="id" value={product.id} />
                    <div className="admin-form-grid">
                      <label className="admin-label">
                        Badge on the photo
                        <input
                          className="admin-input"
                          name="badge"
                          defaultValue={product.badge || ''}
                          list="badge-presets"
                          placeholder="Leave empty for none"
                        />
                        <span className="admin-hint">
                          Your own words win over the automatic labels, so a product with a badge
                          shows that instead of “Best seller”.
                        </span>
                      </label>
                      <label className="admin-label">
                        Best seller badge
                        <select
                          className="admin-input"
                          name="bestSellerMode"
                          defaultValue={product.bestSellerMode}
                        >
                          {MODE_LABELS.map(([value, label, hint]) => (
                            <option value={value} key={value}>
                              {label} — {hint}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="admin-label">
                        New badge
                        <select
                          className="admin-input"
                          name="newArrivalMode"
                          defaultValue={product.newArrivalMode}
                        >
                          {MODE_LABELS.map(([value, label, hint]) => (
                            <option value={value} key={value}>
                              {label} — {hint}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="admin-actions">
                      <label className="admin-checkbox">
                        <input name="featured" type="checkbox" defaultChecked={product.featured} />{' '}
                        Featured
                      </label>
                      <label className="admin-checkbox">
                        <input
                          name="staffPick"
                          type="checkbox"
                          defaultChecked={product.staffPick}
                        />{' '}
                        Tammy’s pick
                      </label>
                      <PendingSubmit className="btn small" pendingLabel="Saving…">
                        Save labels
                      </PendingSubmit>
                    </div>
                  </form>
                </div>
              );
            })
          )}
          <datalist id="badge-presets">
            {BADGE_PRESETS.map((preset) => (
              <option value={preset} key={preset} />
            ))}
          </datalist>
        </section>

        <section className="admin-section" id="order">
          <div className="toolbar">
            <div>
              <h2>Product order</h2>
              <p className="muted">
                The order products appear in under “Featured first” — in the shop, in a collection
                and in a homepage row. Drag them, or use the arrows.
              </p>
            </div>
          </div>
          <div className="admin-card">
            <AdminReorder
              action={reorderProducts}
              label="Save product order"
              emptyMessage="No active products to arrange."
              items={products.map((product) => ({
                id: product.id,
                label: product.name,
                note: [
                  productTypeLabel(product.type),
                  product.featured ? 'featured' : null,
                  product.staffPick ? 'your pick' : null
                ]
                  .filter(Boolean)
                  .join(' · ')
              }))}
            />
          </div>
        </section>

        <section className="admin-section" id="collections">
          <div className="toolbar">
            <div>
              <h2>Featured collections</h2>
              <p className="muted">
                Featured collections are the picture tiles a collection-tiles row shows. A
                collection with nothing in stock is never advertised, however it is set here.
              </p>
            </div>
            <Link className="btn outline small" href="/admin/content#collections">
              Edit collection pages
            </Link>
          </div>

          <div className="admin-card">
            <h3>Order they appear in</h3>
            <AdminReorder
              action={reorderCollections}
              label="Save collection order"
              emptyMessage="No collections yet."
              items={collections.map((collection) => ({
                id: collection.id,
                label: collection.title,
                note: `${collection._count.products} in stock${collection.featured ? ' · featured' : ''}${
                  collection.active ? '' : ' · hidden'
                }`
              }))}
            />
          </div>

          {collections.map((collection) => (
            <div className="admin-card" key={collection.id}>
              <form action={updateCollectionFeature}>
                <input type="hidden" name="id" value={collection.id} />
                <div className="admin-actions">
                  <b style={{ marginRight: 'auto' }}>
                    {collection.title}{' '}
                    <span className="muted">({collection._count.products} in stock)</span>
                  </b>
                  <label className="admin-checkbox">
                    <input name="featured" type="checkbox" defaultChecked={collection.featured} />{' '}
                    Feature on the homepage
                  </label>
                  <label className="admin-checkbox">
                    <input name="active" type="checkbox" defaultChecked={collection.active} /> Live
                    on the website
                  </label>
                  <PendingSubmit className="btn small" pendingLabel="Saving…">
                    Save
                  </PendingSubmit>
                </div>
              </form>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
