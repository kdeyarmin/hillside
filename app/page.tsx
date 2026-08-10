import Link from 'next/link';
import { ArrowRight, Heart, Leaf, Package, Sparkles, Sprout } from 'lucide-react';
import BrandMockupScene from '@/components/BrandMockupScene';
import NewsletterForm from '@/components/NewsletterForm';
import ProductGrid from '@/components/ProductGrid';
import { classFormatLabel, classLocationLabel, isOnlineClass } from '@/lib/class-access';
import { seatsRemaining } from '@/lib/class-seats';
import { db } from '@/lib/db';
import { ratingsByProduct } from '@/lib/reviews';
import { formatMoney } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [featuredProducts, upcomingClasses, collections] = await Promise.all([
    db.product.findMany({
      where: { active: true, featured: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 4
    }),
    db.classEvent.findMany({
      where: { active: true, startsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      take: 2
    }),
    // Only collections that actually hold something are advertised, so a tile on
    // the homepage always leads to real stock.
    db.collection.findMany({
      where: { active: true, featured: true, products: { some: { active: true } } },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: { _count: { select: { products: { where: { active: true } } } } }
    })
  ]);

  const ratings = await ratingsByProduct(featuredProducts.map((product) => product.id));
  const featured = featuredProducts.map((product) => ({
    ...product,
    averageRating: ratings.get(product.id)?.average ?? null,
    reviewCount: ratings.get(product.id)?.count ?? 0
  }));
  const classSeats = new Map<string, number>(
    await Promise.all(
      upcomingClasses.map(
        async (event) => [event.id, await seatsRemaining(event.id, event.capacity)] as const
      )
    )
  );

  return (
    <>
      <section className="editorial-hero">
        <div className="editorial-hero-copy">
          <span className="eyebrow">Welcome to The Hillside Gardens</span>
          <h1>
            Rooted in Nature.
            <br />
            Grown with Care.
          </h1>
          <div className="botanical-rule" aria-hidden="true">
            <span />
            <Leaf size={22} />
            <span />
          </div>
          <p>
            Explore hand-selected plants, living arrangements, terrarium supplies, handmade soaps
            and botanical goods chosen to make everyday spaces feel warmer and more personal.
          </p>
          <div className="actions">
            <Link className="btn editorial-btn" href="/shop">
              Shop now <ArrowRight size={17} />
            </Link>
            <Link className="editorial-link" href="/classes">
              Explore our classes →
            </Link>
          </div>
        </div>
        <BrandMockupScene variant="hero" className="editorial-hero-image" badge />
      </section>

      <section className="trust-strip" aria-label="Why shop The Hillside Gardens">
        <div>
          <Leaf />
          <span>
            <b>Natural & thoughtful</b>
            <small>Plants and goods chosen with care.</small>
          </span>
        </div>
        <div>
          <Sparkles />
          <span>
            <b>Premium quality</b>
            <small>Small batches and considered details.</small>
          </span>
        </div>
        <div>
          <Package />
          <span>
            <b>Careful fulfillment</b>
            <small>Secure packaging and order tracking.</small>
          </span>
        </div>
        <div>
          <Heart />
          <span>
            <b>Made with care</b>
            <small>Small business, big plant passion.</small>
          </span>
        </div>
      </section>

      <div className="home-merch">
      {collections.length > 0 && (
        <section className="section editorial-section home-collections-section">
          <div className="container">
            <div className="sectionhead">
              <div className="eyebrow">Shop the garden</div>
              <h2>Bring a little Hillside home.</h2>
              <p>
                Discover the plants, handmade goods and natural supplies that make The Hillside
                Gardens collection distinctive.
              </p>
            </div>
            <div className="editorial-collections">
              {collections.map((collection) => (
                <Link
                  className="editorial-collection"
                  href={`/collections/${collection.slug}`}
                  key={collection.id}
                >
                  <BrandMockupScene
                    variant="plants"
                    imageSrc={collection.imageUrl}
                    alt={collection.title}
                  />
                  <div>
                    <span>{collection.tagline || `${collection._count.products} to browse`}</span>
                    <h3>{collection.title}</h3>
                    <b>Shop collection →</b>
                  </div>
                </Link>
              ))}
            </div>
            <div className="collections-all">
              <Link className="editorial-link" href="/collections">See every collection →</Link>
            </div>
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section className="section editorial-products home-products-section">
          <div className="container">
            <div className="editorial-heading-row">
              <div>
                <div className="eyebrow">New &amp; noteworthy</div>
                <h2>Our current favorites.</h2>
              </div>
              <Link className="editorial-link" href="/shop">
                Shop all products →
              </Link>
            </div>
            <ProductGrid products={featured} />
          </div>
        </section>
      )}
      </div>

      <section className="section tammy-story home-story-section">
        <div className="container split">
          <div className="story-photo">
            <BrandMockupScene variant="about" alt="Terracotta pots, twine and seedlings on the Hillside potting bench" />
          </div>
          <div>
            <div className="eyebrow">Grow with confidence</div>
            <h2>Beautiful plants are better when you know how to care for them.</h2>
            <p className="quote">
              “You don’t need a green thumb. You just need to understand what your plant is asking
              for.”
            </p>
            <p>
              Tammy Hill created The Hillside Gardens around a love of plants and a love of
              teaching. Our in-person and online classes make choosing, arranging and caring for
              plants approachable — even if you’re just getting started.
            </p>
            <div className="actions">
              <Link className="btn editorial-btn" href="/about">
                Meet Tammy
              </Link>
              <Link className="editorial-link" href="/care">
                Plant care library →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {upcomingClasses.length > 0 && (
        <section className="section editorial-classes home-classes-section">
          <div className="container">
            <div className="sectionhead">
              <div className="eyebrow">Learn with us</div>
              <h2>Make something beautiful, in person or online.</h2>
              <p>
                Relaxed, practical plant classes offered at The Hillside Gardens and through secure
                Telnyx Video rooms.
              </p>
            </div>
            <div className={`grid auto${upcomingClasses.length === 1 ? ' single' : ''}`}>
              {upcomingClasses.map((event) => {
                const seatsLeft = classSeats.get(event.id) ?? event.capacity;
                const online = isOnlineClass(event.format);

                return (
                  <article className="class-editorial" key={event.id}>
                    <BrandMockupScene
                      variant="class"
                      backgroundSrc={event.imageUrl || undefined}
                      alt={`${event.title} at The Hillside Gardens`}
                      badge={false}
                    />
                    <div>
                      <span className="product-kicker">{classFormatLabel(event.format)}</span>
                      <h3>{event.title}</h3>
                      <p>{event.description}</p>
                      <p>
                        <b>
                          {event.startsAt.toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </b>{' '}
                        ·{' '}
                        {event.startsAt.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </p>
                      <p>{classLocationLabel(event)}</p>
                      {online && <p><b>Private classroom link emailed after registration.</b></p>}
                      <p>
                        {seatsLeft} seats remaining · {event.priceCents > 0 ? `${formatMoney(event.priceCents)} per person` : 'Free'}
                      </p>
                      <Link className="btn editorial-btn" href="/classes">
                        View class
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="section care-promo home-care-section">
        <div className="container care-promo-inner">
          <Sprout size={42} />
          <div>
            <div className="eyebrow">Plant help, without the guesswork</div>
            <h2>Keep your plants happy.</h2>
            <p>
              Use our practical care sheets for light, watering, soil, feeding, pet safety and
              the little details that make a difference.
            </p>
          </div>
          <Link className="btn light" href="/care">
            Browse plant care
          </Link>
        </div>
      </section>

      <section className="section home-newsletter-section">
        <div className="container newsletter editorial-newsletter">
          <div>
            <div className="eyebrow">The Hillside Notes</div>
            <h3>Seasonal tips, class dates & fresh arrivals.</h3>
            <p>A thoughtful note from us, sent occasionally.</p>
          </div>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}
