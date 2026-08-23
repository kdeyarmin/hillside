import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProductRelationKind } from '@prisma/client';
import AdminDeepLink from '@/components/AdminDeepLink';
import ConfirmSubmit from '@/components/ConfirmSubmit';
import { isAdmin } from '@/lib/admin';
import { ADMIN_ERRORS, ADMIN_NOTICES, firstSearchParam } from '@/lib/admin-dashboard';
import { bundleAvailability, bundleSavingsNote, MAX_BUNDLE_ITEMS } from '@/lib/bundles';
import { bundleSaleInclude } from '@/lib/bundle-queries';
import { careGuideTypeLabel } from '@/lib/care-guides';
import { db } from '@/lib/db';
import { productSizes } from '@/lib/product-sizes';
import {
  MAX_RELATIONS_PER_KIND,
  RECOMMENDATION_SECTIONS,
  RECOMMENDATION_TAGS
} from '@/lib/recommendations';
import { formatMoney } from '@/lib/store';
import {
  deleteBundle,
  saveBundle,
  saveCareGuideProducts,
  saveProductRelations,
  saveProductTags,
  setBundleActive
} from '../merchandising-actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sets & Recommendations' };

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

export default async function MerchandisingManager({
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

  const [bundles, products, relations, guides, guideProducts] = await Promise.all([
    db.bundle.findMany({
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { title: 'asc' }],
      include: bundleSaleInclude
    }),
    db.product.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        active: true,
        inventory: true,
        priceCents: true,
        sizes: true,
        tags: true,
        type: true
      }
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

  const sellableProducts = products.filter((product) => product.active);
  const relationsFor = (productId: string, kind: ProductRelationKind) =>
    relations.filter((relation) => relation.productId === productId && relation.kind === kind);
  const guideProductsFor = (careSheetId: string) =>
    guideProducts.filter((entry) => entry.careSheetId === careSheetId);

  const liveSets = bundles.filter(
    (bundle) => bundle.active && bundleAvailability(bundle).sets > 0
  ).length;
  const blockedSets = bundles.filter(
    (bundle) => bundle.active && bundleAvailability(bundle).sets <= 0
  ).length;

  return (
    <div className="adminshell">
      <AdminDeepLink
        section={focusSection || undefined}
        focusId={focusItem ? `merch-${focusItem}` : undefined}
      />
      <aside className="sidebar">
        <img src="/logo.webp" alt="The Hillside Gardens" />
        <b>Sets &amp; Recommendations</b>
        <Link href="/admin">← Business dashboard</Link>
        <Link href="/admin/content">Website content</Link>
        <a href="#bundles">Sets &amp; kits</a>
        <a href="#add-bundle">Add a set</a>
        <a href="#cross-sell">Recommendations</a>
        <a href="#care-commerce">Products on care guides</a>
        <Link href="/bundles">View public sets page</Link>
      </aside>

      <div className="adminmain">
        <div className="eyebrow">Merchandising</div>
        <h1>Sets &amp; recommendations</h1>
        <p className="muted">
          Build a set out of things you already sell, and decide what the website suggests next to
          each product.
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
            <span>Sets on the website</span>
            <strong>{liveSets}</strong>
          </div>
          <div className="stat">
            <span>Waiting on stock</span>
            <strong>{blockedSets}</strong>
          </div>
          <div className="stat">
            <span>Recommendations set</span>
            <strong>{relations.length}</strong>
          </div>
          <div className="stat">
            <span>Guides selling products</span>
            <strong>{new Set(guideProducts.map((entry) => entry.careSheetId)).size}</strong>
          </div>
        </div>

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
                    {product.tags.length > 0 ? ` • ${product.tags.join(', ')}` : ''}
                  </span>
                  <span className="status-badge PAID">
                    {relations.filter((relation) => relation.productId === product.id).length}{' '}
                    chosen
                  </span>
                </summary>
                <div>
                  <form action={saveProductTags}>
                    <input type="hidden" name="productId" value={product.id} />
                    <label className="admin-label">
                      Tags — one per line, or separated by commas
                      <textarea
                        className="admin-input"
                        name="tags"
                        rows={2}
                        defaultValue={product.tags.join(', ')}
                        placeholder={RECOMMENDATION_TAGS.slice(0, 6).join(', ')}
                      />
                    </label>
                    <p className="muted" style={{ fontSize: 13 }}>
                      The words the automatic suggestions match on. Useful ones:{' '}
                      {RECOMMENDATION_TAGS.join(', ')}.
                    </p>
                    <button className="btn outline small">Save tags</button>
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
