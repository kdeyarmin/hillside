import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AddToCartButton from '@/components/AddToCartButton';
import BrandedProductVisual from '@/components/BrandedProductVisual';
import { db } from '@/lib/db';
import { absoluteUrl, FALLBACK_PRODUCT_IMAGE, formatMoney, productTypeLabel } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await db.product.findFirst({ where: { slug, active: true } });
  if (!product) return { title: 'Product not found' };
  return {
    title: product.name,
    description: product.shortDescription || product.description,
    alternates: { canonical: `/shop/${product.slug}` },
    openGraph: {
      title: product.name,
      description: product.shortDescription || product.description,
      url: `/shop/${product.slug}`,
      images: [{ url: product.imageUrl || FALLBACK_PRODUCT_IMAGE, alt: product.name }]
    }
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await db.product.findFirst({ where: { slug, active: true } });
  if (!product) notFound();

  const related = await db.product.findMany({
    where: { active: true, type: product.type, id: { not: product.id } },
    orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
    take: 3
  });

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription || product.description,
    image: product.imageUrl || FALLBACK_PRODUCT_IMAGE,
    sku: product.sku || undefined,
    brand: { '@type': 'Brand', name: 'The Hillside Gardens' },
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/shop/${product.slug}`),
      priceCurrency: 'USD',
      price: (product.priceCents / 100).toFixed(2),
      availability:
        product.inventory > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
    }
  };

  return (
    <section className="content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <div className="container">
        <div className="breadcrumbs">
          <Link href="/">Home</Link><span>/</span><Link href="/shop">Shop</Link><span>/</span><span>{product.name}</span>
        </div>
        <div className="product-detail">
          <div className="product-detail-image-wrap">
            <BrandedProductVisual
              slug={product.slug}
              name={product.name}
              type={product.type}
              imageUrl={product.imageUrl}
              className="product-detail-image"
              detail
              loading="eager"
            />
          </div>
          <div className="product-detail-copy">
            <div className="eyebrow">{productTypeLabel(product.type)}</div>
            {product.badge && <span className="pill">{product.badge}</span>}
            <h1>{product.name}</h1>
            {product.shortDescription && <p className="lead">{product.shortDescription}</p>}
            <p>{product.description}</p>
            <p className="product-detail-price">
              {formatMoney(product.priceCents)}
              {product.compareAtCents && product.compareAtCents > product.priceCents && (
                <span className="compare-price">{formatMoney(product.compareAtCents)}</span>
              )}
            </p>
            <p className={`stock ${product.inventory === 0 ? 'out' : product.inventory <= 3 ? 'low' : ''}`}>
              {product.inventory === 0
                ? 'Currently sold out'
                : product.inventory <= 3
                  ? `Only ${product.inventory} available`
                  : `${product.inventory} available`}
            </p>

            <div className="product-detail-notes">
              {product.careNotes && <div className="note-box"><b>Care at a glance</b>{product.careNotes}</div>}
              {product.shippingNote && <div className="note-box"><b>Shipping note</b>{product.shippingNote}</div>}
              <div className="note-box"><b>Secure checkout</b>Payment is processed by Stripe. A receipt and invoice are emailed after purchase.</div>
            </div>

            <AddToCartButton
              product={{
                slug: product.slug,
                name: product.name,
                priceCents: product.priceCents,
                imageUrl: product.imageUrl,
                inventory: product.inventory,
                type: product.type
              }}
            />
            {product.sku && <p className="muted" style={{ fontSize: 12 }}>Item number: {product.sku}</p>}
          </div>
        </div>

        {product.details && (
          <div className="product-details-section narrow prose">
            <div className="eyebrow">Product details</div>
            <h2>About this item</h2>
            <p style={{ whiteSpace: 'pre-line' }}>{product.details}</p>
          </div>
        )}

        {related.length > 0 && (
          <div className="product-details-section">
            <div className="sectionhead">
              <div className="eyebrow">You may also like</div>
              <h2>More from this collection.</h2>
            </div>
            <div className="product-grid">
              {related.map((item) => (
                <article className="product-card" key={item.id}>
                  <Link className="product-image-wrap" href={`/shop/${item.slug}`}>
                    <BrandedProductVisual
                      slug={item.slug}
                      name={item.name}
                      type={item.type}
                      imageUrl={item.imageUrl}
                    />
                  </Link>
                  <div className="product-copy">
                    <span className="pill">{productTypeLabel(item.type)}</span>
                    <h3><Link href={`/shop/${item.slug}`}>{item.name}</Link></h3>
                    <p>{item.shortDescription || item.description}</p>
                    <div className="product-actions">
                      <strong className="price">{formatMoney(item.priceCents)}</strong>
                      <Link className="btn small" href={`/shop/${item.slug}`}>View</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
