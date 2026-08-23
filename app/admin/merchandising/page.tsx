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
  MAX_HOMEPAGE_SECTION_ITEMS,
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
import { formatMoney, productTypeLabel } from '@/lib/store';
import {
  MAX_RELATIONS_PER_KIND,
  RECOMMENDATION_SECTIONS,
  RECOMMENDATION_TAGS
} from '@/lib/recommendations';
import ConfirmSubmit from '@/components/ConfirmSubmit';
import { bundleAvailability, bundleSavingsNote, MAX_BUNDLE_ITEMS } from '@/lib/bundles';
import { bundleSaleInclude } from '@/lib/bundle-queries';
import { careGuideTypeLabel } from '@/lib/care-guides';
import { productSizes } from '@/lib/product-sizes';
import { ProductRelationKind } from '@prisma/client';
import {
  deleteBundle,
  deleteHomepageSection,
  reorderCollections,
  reorderHomepageSections,
  reorderProducts,
  saveBundle,
  saveCareGuideProducts,
  saveHomepageSection,
  saveProductRelations,
  saveProductTraits,
  setBundleActive,
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
            max={MAX_HOMEPAGE_SECTION_ITEMS}
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

type PickerProduct = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  inventory: number;
  priceCents: number;
  sizes: unknown;
};

/**
 * One line of a set's recipe.
 *
 * The variant box is a plain text field that lists the product's sizes as its
 * placeholder rather than a dependent dropdown, because the choice of product
 * happens in the same row and a select that repopulated on change would need
 * client JavaScript in a form that is otherwise a plain POST. The label typed
 * here is matched the same forgiving way a shopper's is — case and spacing do
 * not have to match — and a variant that does not exist takes the set off sale
 * rather than silently shipping the wrong jar.
 */
function BundleItemRow({
  index,
  products,
  item
}: {
  index: number;
  products: PickerProduct[];
  item?: {
    productId: string;
    size: string | null;
    quantity: number;
    optional: boolean;
    note: string | null;
  };
}) {
  const chosen = products.find((product) => product.id === item?.productId);
  const chosenSizes = chosen ? productSizes(chosen.sizes, chosen.priceCents) : [];
  return (
    <div className="bundle-item-row">
      <label className="admin-label">
        Item {index + 1}
        <select
          className="admin-input"
          name={`itemProductId-${index}`}
          defaultValue={item?.productId || ''}
        >
          <option value="">— nothing in this row —</option>
          {products.map((product) => (
            <option value={product.id} key={product.id}>
              {product.name}
              {product.active ? '' : ' (archived)'}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-label">
        Required variant
        <input
          className="admin-input"
          name={`itemSize-${index}`}
          defaultValue={item?.size || ''}
          placeholder={
            chosenSizes.length
              ? chosenSizes.map((size) => size.label).join(' / ')
              : 'Only for sized products'
          }
        />
      </label>
      <label className="admin-label">
        How many
        <input
          className="admin-input"
          name={`itemQuantity-${index}`}
          type="number"
          min="1"
          max="24"
          defaultValue={item?.quantity ?? 1}
        />
      </label>
      <label className="admin-label">
        Note shown on the set page
        <input
          className="admin-input"
          name={`itemNote-${index}`}
          defaultValue={item?.note || ''}
          placeholder="Why this piece is in the box"
        />
      </label>
      <label className="admin-checkbox">
        <input
          name={`itemOptional-${index}`}
          type="checkbox"
          defaultChecked={item?.optional ?? false}
        />{' '}
        Extra
      </label>
    </div>
  );
}

function BundleFields({
  products,
  bundle
}: {
  products: PickerProduct[];
  bundle?: {
    id: string;
    slug: string;
    title: string;
    tagline: string | null;
    description: string;
    imageUrl: string | null;
    galleryImages: string[];
    priceCents: number;
    badge: string | null;
    active: boolean;
    featured: boolean;
    sortOrder: number;
    items: Array<{
      productId: string;
      size: string | null;
      quantity: number;
      optional: boolean;
      note: string | null;
    }>;
  };
}) {
  const existing = bundle?.items || [];
  // Two spare rows so adding a piece never needs a save-and-come-back.
  const rows = Math.min(MAX_BUNDLE_ITEMS, Math.max(4, existing.length + 2));

  return (
    <>
      {bundle && <input type="hidden" name="id" value={bundle.id} />}
      <div className="admin-form-grid">
        <label className="admin-label">
          Set title
          <input className="admin-input" name="title" defaultValue={bundle?.title} required />
        </label>
        <label className="admin-label">
          URL slug
          <input
            className="admin-input"
            name="slug"
            defaultValue={bundle?.slug || ''}
            placeholder="created-from-title"
          />
        </label>
        <label className="admin-label">
          Selling price for the whole set
          <input
            className="admin-input"
            name="price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={bundle ? (bundle.priceCents / 100).toFixed(2) : ''}
            required
          />
        </label>
        <label className="admin-label">
          Badge
          <input
            className="admin-input"
            name="badge"
            defaultValue={bundle?.badge || ''}
            placeholder="Best seller, Gift ready"
          />
        </label>
        <label className="admin-label">
          Display order
          <input
            className="admin-input"
            name="sortOrder"
            type="number"
            defaultValue={bundle?.sortOrder ?? 0}
          />
        </label>
        <label className="admin-label">
          Set photo URL
          <input
            className="admin-input"
            name="imageUrl"
            type="text"
            defaultValue={bundle?.imageUrl || ''}
          />
        </label>
        <label className="admin-label full">
          Short tagline
          <input
            className="admin-input"
            name="tagline"
            defaultValue={bundle?.tagline || ''}
            placeholder="Everything you need for a first cup"
          />
        </label>
        <label className="admin-label full">
          Description
          <textarea
            className="admin-input"
            name="description"
            rows={4}
            defaultValue={bundle?.description || ''}
            required
          />
        </label>
        <label className="admin-label full">
          Extra photo URLs — one per line
          <textarea
            className="admin-input"
            name="galleryImages"
            rows={2}
            defaultValue={(bundle?.galleryImages || []).join('\n')}
          />
        </label>
      </div>

      <div className="admin-card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>What is in the set</h3>
        <p className="muted">
          These are the actual products, and they are what the sale takes off the shelf — there is
          no separate stock count for a set. If a product is sold in sizes, type which one the set
          contains; without it the set cannot be built and will not be listed. Tick <b>Extra</b> for
          a garnish that should not take the whole set off sale when it runs out.
        </p>
        {Array.from({ length: rows }, (_, index) => (
          <BundleItemRow key={index} index={index} products={products} item={existing[index]} />
        ))}
      </div>

      <div className="admin-actions">
        <label className="admin-checkbox">
          <input name="active" type="checkbox" defaultChecked={bundle?.active ?? true} /> Offered on
          the website
        </label>
        <label className="admin-checkbox">
          <input name="featured" type="checkbox" defaultChecked={bundle?.featured ?? false} />{' '}
          Feature this set
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
    item?: string | string[];
  }>;
}) {
  if (!(await isAdmin())) redirect('/admin');
  const params = await searchParams;
  const notice = ADMIN_NOTICES[firstSearchParam(params.notice)];
  const errorMessage = ADMIN_ERRORS[firstSearchParam(params.error)];
  const focusSection = firstSearchParam(params.section);
  const focusItem = firstSearchParam(params.item);

  const [sections, collections, products, stats, bundles, relations, guides, guideProducts] =
    await Promise.all([
      db.homepageSection.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { collection: { select: { title: true } } }
      }),
      db.collection.findMany({
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        include: { _count: { select: { products: { where: { active: true } } } } }
      }),
      /**
       * One products query for the whole page. The label editor, the set builder
       * and the tag editor all read it, so the columns are the union of what they
       * render rather than three passes over the same rows.
       *
       * Archived products are included because a set may still name one, and the
       * builder has to be able to say so.
       */
      db.product.findMany({
        orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
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
          sortOrder: true,
          active: true,
          inventory: true,
          priceCents: true,
          sizes: true,
          tags: true,
          traits: true
        },
        take: 300
      }),
      salesStats(),
      db.bundle.findMany({
        orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { title: 'asc' }],
        include: bundleSaleInclude
      }),
      db.productRelation.findMany({
        orderBy: [{ sortOrder: 'asc' }],
        include: { related: { select: { id: true, name: true } } }
      }),
      db.careSheet.findMany({
        orderBy: [{ published: 'desc' }, { guideType: 'asc' }, { plantName: 'asc' }],
        select: { id: true, plantName: true, slug: true, guideType: true, published: true }
      }),
      db.careGuideProduct.findMany({ orderBy: { sortOrder: 'asc' } })
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

  const sellableProducts = products.filter((product) => product.active);
  const relationsFor = (productId: string, kind: ProductRelationKind) =>
    relations.filter((relation) => relation.productId === productId && relation.kind === kind);
  const guideProductsFor = (careSheetId: string) =>
    guideProducts.filter((entry) => entry.careSheetId === careSheetId);

  return (
    <div className="adminshell">
      <AdminDeepLink
        section={focusSection || undefined}
        focusId={focusItem ? `merch-${focusItem}` : undefined}
      />
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

        <section className="admin-section" id="bundles">
          <div className="toolbar">
            <div>
              <h2>Sets &amp; kits</h2>
              <p className="muted">
                A set has no stock of its own. The website works out how many it can build from the
                pieces, every time somebody looks — so a set disappears on its own when one of its
                pieces runs out, and comes back when you restock it.
              </p>
            </div>
            <Link className="btn outline small" href="/bundles">
              View public sets page
            </Link>
          </div>

          <div className="admin-list">
            {bundles.length === 0 && (
              <p className="muted">No sets yet. Build the first one in the form below.</p>
            )}
            {bundles.map((bundle) => {
              const availability = bundleAvailability(bundle);
              const saving = bundleSavingsNote(bundle);
              return (
                <details key={bundle.id} id={`merch-${bundle.id}`} open={focusItem === bundle.id}>
                  <summary>
                    <span>
                      {bundle.title} • {formatMoney(bundle.priceCents)} • {bundle.items.length}{' '}
                      {bundle.items.length === 1 ? 'piece' : 'pieces'}
                      {saving ? ` • ${saving.toLowerCase()}` : ''}
                    </span>
                    <span className="admin-badges">
                      {bundle.active && availability.sets <= 0 && (
                        <span className="status-badge">Waiting on stock</span>
                      )}
                      <span className={`status-badge ${bundle.active ? 'PAID' : 'CANCELLED'}`}>
                        {bundle.active
                          ? availability.sets > 0
                            ? `${availability.sets} ready`
                            : 'Offered'
                          : 'Archived'}
                      </span>
                    </span>
                  </summary>
                  <div>
                    {availability.unpinned.length > 0 && (
                      <div className="admin-card admin-alert" role="alert">
                        <b>
                          {availability.unpinned.map((item) => item.product.name).join(', ')}{' '}
                          {availability.unpinned.length === 1 ? 'is' : 'are'} sold in more than one
                          size, and this set does not say which.
                        </b>
                        <p>
                          Type the exact size into <b>Required variant</b> below. Until then the set
                          stays off the website, because nobody has said what goes in the box.
                        </p>
                      </div>
                    )}
                    {availability.blocking.length > 0 && (
                      <p className="muted" style={{ marginTop: 0 }}>
                        <b>Not listed right now:</b>{' '}
                        {availability.blocking.map((item) => item.product.name).join(', ')}{' '}
                        {availability.blocking.length === 1 ? 'has' : 'have'} none on the bench.
                      </p>
                    )}
                    <form action={saveBundle}>
                      <BundleFields products={products} bundle={bundle} />
                      <div className="admin-actions">
                        <button className="btn small">Save set</button>
                        <Link className="btn outline small" href={`/bundles/${bundle.slug}`}>
                          View set
                        </Link>
                      </div>
                    </form>
                    <form action={setBundleActive} style={{ marginTop: 10 }}>
                      <input type="hidden" name="id" value={bundle.id} />
                      <input type="hidden" name="active" value={bundle.active ? 'false' : 'true'} />
                      <button className={`text-button ${bundle.active ? 'danger' : ''}`}>
                        {bundle.active ? 'Archive set' : 'Offer this set again'}
                      </button>
                    </form>
                    <form action={deleteBundle} style={{ marginTop: 10 }}>
                      <input type="hidden" name="id" value={bundle.id} />
                      <ConfirmSubmit
                        className="text-button danger"
                        message={`Delete “${bundle.title}”? Past orders that contained it keep their record. Nothing is removed from inventory.`}
                      >
                        Delete set
                      </ConfirmSubmit>
                    </form>
                  </div>
                </details>
              );
            })}
          </div>

          <div className="admin-card" id="add-bundle" style={{ marginTop: 20 }}>
            <h2 style={{ marginTop: 0 }}>Build a set</h2>
            <p className="muted">
              For example: a tea, plus the infuser to brew it in, sold together for less than the
              two on their own.
            </p>
            <form action={saveBundle}>
              <BundleFields products={products} />
              <button className="btn" style={{ marginTop: 16 }}>
                Create set
              </button>
            </form>
          </div>
        </section>

        <section className="admin-section" id="cross-sell">
          <div className="toolbar">
            <div>
              <h2>What the website suggests next</h2>
              <p className="muted">
                Each product page shows up to three headings —{' '}
                {RECOMMENDATION_SECTIONS.map((section) => `“${section.title}”`).join(', ')} — plus
                “Frequently bought together”, which comes from real orders and needs nothing from
                you. Anything you choose here always wins. What you leave blank is filled in
                automatically, from the tags below and from what each product says about itself; if
                nothing fits, the heading simply does not appear.
              </p>
            </div>
          </div>

          <div className="admin-list">
            {sellableProducts.map((product) => (
              <details key={product.id} id={`merch-${product.id}`} open={focusItem === product.id}>
                <summary>
                  <span>
                    {product.name}
                    {product.traits.length > 0 ? ` • ${product.traits.join(', ')}` : ''}
                  </span>
                  <span className="status-badge PAID">
                    {relations.filter((relation) => relation.productId === product.id).length}{' '}
                    chosen
                  </span>
                </summary>
                <div>
                  <form action={saveProductTraits}>
                    <input type="hidden" name="productId" value={product.id} />
                    <label className="admin-label">
                      Traits — one per line, or separated by commas
                      <textarea
                        className="admin-input"
                        name="traits"
                        rows={2}
                        defaultValue={product.traits.join(', ')}
                        placeholder={RECOMMENDATION_TAGS.slice(0, 6).join(', ')}
                      />
                    </label>
                    <p className="muted" style={{ fontSize: 13 }}>
                      The words the automatic suggestions match on. Useful ones:{' '}
                      {RECOMMENDATION_TAGS.join(', ')}. Traits are added to what the website already
                      works out from the product&rsquo;s own description — to switch one of those
                      off instead, write it with a minus in front, like <code>-terrarium</code>.
                    </p>
                    <p className="muted" style={{ fontSize: 13 }}>
                      Not the same as the <b>attributes</b> on the product form (pet safe, low
                      light, handmade). Those are the fixed list shoppers filter the shop by; these
                      are free words only ever matched against other products. The suggestions read
                      both.
                    </p>
                    <button className="btn outline small">Save traits</button>
                  </form>

                  {RECOMMENDATION_SECTIONS.map((section) => {
                    const chosen = relationsFor(product.id, section.kind as ProductRelationKind);
                    const chosenIds = new Set(chosen.map((relation) => relation.relatedProductId));
                    return (
                      <form
                        action={saveProductRelations}
                        key={section.kind}
                        style={{ marginTop: 18 }}
                      >
                        <input type="hidden" name="productId" value={product.id} />
                        <input type="hidden" name="kind" value={section.kind} />
                        <label className="admin-label">
                          {section.title} — {section.blurb}
                          <select
                            className="admin-input"
                            name="relatedProductId"
                            multiple
                            size={6}
                            defaultValue={[...chosenIds]}
                          >
                            {sellableProducts
                              .filter((candidate) => candidate.id !== product.id)
                              .map((candidate) => (
                                <option value={candidate.id} key={candidate.id}>
                                  {candidate.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <p className="muted" style={{ fontSize: 13 }}>
                          Hold Ctrl (or Command on a Mac) to choose more than one, up to{' '}
                          {MAX_RELATIONS_PER_KIND}. Leave it empty to let the website decide.
                        </p>
                        {chosen.map((relation) => (
                          <label className="admin-label" key={relation.id}>
                            Why {relation.related.name} goes with it
                            <input
                              className="admin-input"
                              name={`note-${relation.relatedProductId}`}
                              defaultValue={relation.note || ''}
                              placeholder="Printed under the card on the website"
                            />
                          </label>
                        ))}
                        <button className="btn outline small" style={{ marginTop: 10 }}>
                          Save “{section.title}”
                        </button>
                      </form>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="admin-section" id="care-commerce">
          <div className="toolbar">
            <div>
              <h2>Products on care guides</h2>
              <p className="muted">
                A guide can feature what you actually use for the job — the moss a terrarium guide
                calls for, the medium a carnivorous plant needs. Write the reason in your own words;
                that sentence is what keeps the guide reading like advice rather than an advert. A
                sold-out piece is left off the guide automatically.
              </p>
            </div>
            <Link className="btn outline small" href="/admin/care">
              Edit the guides themselves
            </Link>
          </div>

          <div className="admin-list">
            {guides.map((guide) => {
              const chosen = guideProductsFor(guide.id);
              const chosenIds = chosen.map((entry) => entry.productId);
              const named = new Map(products.map((product) => [product.id, product.name]));
              return (
                <details key={guide.id} id={`merch-${guide.id}`} open={focusItem === guide.id}>
                  <summary>
                    <span>
                      {guide.plantName} • {careGuideTypeLabel(guide.guideType)}
                    </span>
                    <span className="admin-badges">
                      {!guide.published && <span className="status-badge">Draft</span>}
                      <span className="status-badge PAID">
                        {chosen.length} {chosen.length === 1 ? 'product' : 'products'}
                      </span>
                    </span>
                  </summary>
                  <div>
                    <form action={saveCareGuideProducts}>
                      <input type="hidden" name="careSheetId" value={guide.id} />
                      <label className="admin-label">
                        Products to feature on this guide
                        <select
                          className="admin-input"
                          name="productId"
                          multiple
                          size={6}
                          defaultValue={chosenIds}
                        >
                          {sellableProducts.map((product) => (
                            <option value={product.id} key={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {chosenIds.map((productId) => (
                        <label className="admin-label" key={productId}>
                          Why {named.get(productId) || 'this'} belongs on the guide
                          <input
                            className="admin-input"
                            name={`note-${productId}`}
                            defaultValue={
                              chosen.find((entry) => entry.productId === productId)?.note || ''
                            }
                            placeholder="This is what we pot ours in"
                          />
                        </label>
                      ))}
                      <div className="admin-actions">
                        <button className="btn small">Save products on this guide</button>
                        <Link className="btn outline small" href={`/care/${guide.slug}`}>
                          View guide
                        </Link>
                      </div>
                    </form>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
