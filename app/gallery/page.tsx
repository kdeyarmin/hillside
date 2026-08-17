import Link from 'next/link';
import GalleryGrid from '@/components/GalleryGrid';
import ProductGrid from '@/components/ProductGrid';
import { pointsAtHiddenClasses } from '@/lib/class-visibility';
import { contactHref } from '@/lib/contact';
import { db } from '@/lib/db';
import { ratingsByProduct } from '@/lib/reviews';
import { pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  path: '/gallery',
  title: 'Planter Gallery',
  description:
    'Browse potted plant arrangements, container combinations and planter inspiration we have created.'
});

export default async function Gallery() {
  const [items, featured] = await Promise.all([
    db.galleryItem.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] }),
    db.product.findMany({
      where: { active: true, inventory: { gt: 0 } },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      take: 3
    })
  ]);

  const ratings = await ratingsByProduct(featured.map((product) => product.id));
  const shopProducts = featured.map((product) => ({
    ...product,
    averageRating: ratings.get(product.id)?.average ?? null,
    reviewCount: ratings.get(product.id)?.count ?? 0
  }));

  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Past work and inspiration</div>
          <h1>Planter gallery.</h1>
          <p>
            A growing collection of arrangements, combinations and garden ideas from The Hillside
            Gardens.
          </p>
        </div>
      </section>
      <section className="content">
        <div className="container">
          {items.length ? (
            <>
              <h2 className="sr-only">Planter arrangements</h2>
              <GalleryGrid
                items={items.map(({ id, title, imageUrl, caption, linkUrl, linkLabel }) => {
                  // A gallery link is typed in the dashboard, so one of them can
                  // point at a class. While classes are hidden that is a button
                  // promising a class over a 404, so it is dropped, not rendered.
                  const hidden = pointsAtHiddenClasses(linkUrl);
                  return {
                    id,
                    title,
                    imageUrl,
                    caption,
                    linkUrl: hidden ? null : linkUrl,
                    linkLabel: hidden ? null : linkLabel
                  };
                })}
              />
            </>
          ) : (
            <div className="empty-state wide">
              <h3>Gallery coming soon.</h3>
              <p>We are preparing photographs of past planter arrangements.</p>
              <div className="actions" style={{ justifyContent: 'center' }}>
                {shopProducts.length > 0 ? (
                  <Link className="btn" href="/shop">
                    Browse the shop meanwhile
                  </Link>
                ) : (
                  <Link className="btn" href="/care">
                    Browse plant care
                  </Link>
                )}
                <Link
                  className="btn outline"
                  href={contactHref({ subject: 'Custom planter arrangement' })}
                >
                  Ask about a custom arrangement
                </Link>
              </div>
            </div>
          )}

          {shopProducts.length > 0 && (
            <div className="product-details-section">
              <div className="sectionhead">
                <div className="eyebrow">Build your own</div>
                <h2>Start with one of these.</h2>
                <p>Every arrangement here began with plants we still have in the shop.</p>
              </div>
              <ProductGrid products={shopProducts} />
            </div>
          )}

          <div className="newsletter" style={{ marginTop: 55 }}>
            <div>
              <div className="eyebrow">Have something in mind?</div>
              <h3>Ask us about a custom arrangement.</h3>
            </div>
            <Link
              className="btn gold"
              href={contactHref({ subject: 'Custom planter arrangement' })}
            >
              Start a conversation
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
