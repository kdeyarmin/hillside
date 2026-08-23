import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import AdminProductFormEnhancer from '@/components/AdminProductFormEnhancer';
import { isAdmin } from '@/lib/admin';
import { ADMIN_ERRORS, ADMIN_NOTICES, firstSearchParam } from '@/lib/admin-dashboard';
import { db } from '@/lib/db';
import { specCompleteness } from '@/lib/product-specs';
import { specKindFor, SPEC_KIND_LABELS } from '@/lib/product-categories';
import { setProductActive, saveProduct } from '../../actions';
import ProductFields from '../product-fields';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit product' };

/**
 * One product, on a page of its own.
 *
 * The dashboard used to inline this whole form once per product, which was
 * workable while a product had a dozen fields and is not now that it has a
 * category, a set of structured details and a variant editor. Rendering that
 * for every row would have meant thousands of inputs on the dashboard, so the
 * list links here instead and each product gets the room to be described
 * properly.
 *
 * `new` is a product that does not exist yet rather than a second route: the
 * form is identical, and product ids are cuids, so the two can never collide.
 */
export default async function AdminProductPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string | string[]; error?: string | string[] }>;
}) {
  if (!(await isAdmin())) redirect('/admin');

  const { id } = await params;
  const query = await searchParams;
  const creating = id === 'new';

  const [product, collections, categories] = await Promise.all([
    creating
      ? null
      : db.product.findUnique({
          where: { id },
          include: {
            collections: { select: { id: true } },
            category: { select: { title: true, slug: true, specKind: true } }
          }
        }),
    db.collection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: { id: true, title: true }
    }),
    db.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: { id: true, title: true, slug: true, specKind: true, active: true }
    })
  ]);

  if (!creating && !product) notFound();

  const notice = ADMIN_NOTICES[firstSearchParam(query.notice)];
  const errorMessage = ADMIN_ERRORS[firstSearchParam(query.error)];
  const kind = product ? specKindFor(product) : null;
  const filledIn = product && kind ? specCompleteness(kind, product.specs) : null;

  return (
    <div className="adminshell">
      <AdminProductFormEnhancer />
      <aside className="sidebar">
        <img src="/logo.webp" alt="The Hillside Gardens" />
        <b>{creating ? 'Add a product' : 'Edit product'}</b>
        <Link href="/admin?section=inventory">← Inventory & products</Link>
        <Link href="/admin/content#categories">Manage categories</Link>
        <Link href="/admin/content#collections">Manage collections</Link>
        {product && <Link href={`/shop/${product.slug}`}>View in the shop</Link>}
        <Link href="/">View public website</Link>
      </aside>
      <div className="adminmain">
        <div className="eyebrow">Inventory</div>
        <h1>{creating ? 'Add a product' : product!.name}</h1>
        <p className="muted">
          {creating
            ? 'Uncheck “Active in shop” to save a draft. Leave it checked to list the piece as soon as you create it.'
            : `${product!.category?.title || 'Not categorised'} · ${
                product!.active ? 'Active in the shop' : 'Archived'
              }${
                filledIn
                  ? ` · ${filledIn.filled} of ${filledIn.total} ${SPEC_KIND_LABELS[
                      kind!
                    ].toLowerCase()} details filled in`
                  : ''
              }`}
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

        <div className="admin-card" style={{ marginTop: 20 }}>
          <form action={saveProduct}>
            <ProductFields
              product={product || undefined}
              collections={collections}
              categories={categories}
            />
            <div className="admin-actions">
              <button className="btn">{creating ? 'Create product' : 'Save product'}</button>
              <Link className="btn outline" href="/admin?section=inventory">
                Back to inventory
              </Link>
              {product && (
                <Link className="btn outline" href={`/shop/${product.slug}`}>
                  View product
                </Link>
              )}
            </div>
          </form>
          {product && (
            <form action={setProductActive} style={{ marginTop: 14 }}>
              <input type="hidden" name="id" value={product.id} />
              <input type="hidden" name="active" value={product.active ? 'false' : 'true'} />
              <button className={`text-button${product.active ? ' danger' : ''}`}>
                {product.active ? 'Archive from shop' : 'Put back in shop'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
