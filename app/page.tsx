import Link from 'next/link';
import { ArrowRight, Heart, Leaf, Package, Sparkles, Sprout } from 'lucide-react';
import NewsletterForm from '@/components/NewsletterForm';
import { db } from '@/lib/db';
import { FALLBACK_PRODUCT_IMAGE, formatMoney, productTypeLabel } from '@/lib/store';

export const dynamic = 'force-dynamic';

const collections = [
  {
    title: 'Plants',
    subtitle: 'Living beauty for every room',
    image:
      'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=1200&q=90',
    href: '/shop?category=PLANT'
  },
  {
    title: 'Teas & Herbals',
    subtitle: 'A slower botanical ritual',
    image:
      'https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?auto=format&fit=crop&w=1200&q=90',
    href: '/shop?category=TEA'
  },
  {
    title: 'Botanicals',
    subtitle: 'Small-batch soaps and lotions',
    image:
      'https://images.unsplash.com/photo-1607006483225-3f4b5308f95d?auto=format&fit=crop&w=1200&q=90',
    href: '/shop?category=SOAP'
  }
];

export default async function Home() {
  const [featured, upcomingClasses] = await Promise.all([
    db.product.findMany({
      where: { active: true, featured: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 4
    }),
    db.classEvent.findMany({
      where: { active: true, startsAt: { gte: new Date() } },
      include: { registrations: { where: { status: 'PAID' }, select: { seats: true } } },
      orderBy: { startsAt: 'asc' },
      take: 2
    })
  ]);

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
            Explore hand-selected plants, comforting teas and thoughtfully made botanicals to
            nurture your home and your everyday rituals.
          </p>
          <div className="actions">
            <Link className="btn editorial-btn" href="/shop">
              Shop now <ArrowRight size={17} />
            </Link>
            <Link className="editorial-link" href="/classes">
              Explore Tammy’s classes →
            </Link>
          </div>
        </div>
        <div
          className="editorial-hero-image"
          role="img"
          aria-label="Potted plants and botanical goods arranged in a warm home setting"
        />
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

      <section className="section editorial-section">
        <div className="container">
          <div className="sectionhead">
            <div className="eyebrow">Shop the garden</div>
            <h2>Bring a little Hillside home.</h2>
            <p>
              Plants, teas and botanical goods selected to make everyday spaces feel warmer,
              greener and more personal.
            </p>
          </div>
          <div className="editorial-collections">
            {collections.map((collection) => (
              <Link className="editorial-collection" href={collection.href} key={collection.title}>
                <img src={collection.image} alt={collection.title} />
                <div>
                  <span>{collection.subtitle}</span>
                  <h3>{collection.title}</h3>
                  <b>Shop collection →</b>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="section editorial-products">
          <div className="container">
            <div className="editorial-heading-row">
              <div>
                <div className="eyebrow">New & noteworthy</div>
                <h2>Tammy’s current favorites.</h2>
              </div>
              <Link className="editorial-link" href="/shop">
                Shop all products →
              </Link>
            </div>
            <div className="product-grid editorial-product-grid">
              {featured.map((product) => (
                <article className="product-card editorial-product" key={product.id}>
                  <Link className="product-image-wrap" href={`/shop/${product.slug}`}>
                    {product.badge && <span className="product-badge">{product.badge}</span>}
                    <img src={product.imageUrl || FALLBACK_PRODUCT_IMAGE} alt={product.name} />
                  </Link>
                  <div className="product-copy">
                    <span className="product-kicker">{productTypeLabel(product.type)}</span>
                    <h3>
                      <Link href={`/shop/${product.slug}`}>{product.name}</Link>
                    </h3>
                    <p>{product.shortDescription || product.description}</p>
                    <div className="product-actions">
                      <strong className="price">{formatMoney(product.priceCents)}</strong>
                      <Link className="editorial-link" href={`/shop/${product.slug}`}>
                        View →
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section tammy-story">
        <div className="container split">
          <div className="story-photo">
            <img
              src="https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1400&q=90"
              alt="Beautiful potted plants ready for a planter class"
            />
          </div>
          <div>
            <div className="eyebrow">Grow with confidence</div>
            <h2>Beautiful plants are better when you know how to care for them.</h2>
            <p className="quote">
              “You don’t need a green thumb. You just need to understand what your plant is asking
              for.”
            </p>
            <p>
              Tammy Hill created The Hillside Gardens around her love of plants and her love of
              teaching. Her hands-on classes make choosing, arranging and caring for plants
              approachable — even if you’re just getting started.
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
        <section className="section editorial-classes">
          <div className="container">
            <div className="sectionhead">
              <div className="eyebrow">Hands-on at The Hillside Gardens</div>
              <h2>Make something beautiful with Tammy.</h2>
              <p>
                Relaxed, practical planter workshops that send you home with a finished arrangement
                and the confidence to keep it thriving.
              </p>
            </div>
            <div className="grid two">
              {upcomingClasses.map((event) => {
                const reserved = event.registrations.reduce(
                  (total, registration) => total + registration.seats,
                  0
                );
                const seatsLeft = Math.max(0, event.capacity - reserved);

                return (
                  <article className="class-editorial" key={event.id}>
                    {event.imageUrl && <img src={event.imageUrl} alt={event.title} />}
                    <div>
                      <span className="product-kicker">In-person workshop</span>
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
                      <p>
                        {seatsLeft} seats remaining · {formatMoney(event.priceCents)} per person
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

      <section className="section care-promo">
        <div className="container care-promo-inner">
          <Sprout size={42} />
          <div>
            <div className="eyebrow">Plant help, without the guesswork</div>
            <h2>Keep your plants happy.</h2>
            <p>
              Use Tammy’s practical care sheets for light, watering, soil, feeding, pet safety and
              the little details that make a difference.
            </p>
          </div>
          <Link className="btn light" href="/care">
            Browse plant care
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="container newsletter editorial-newsletter">
          <div>
            <div className="eyebrow">The Hillside Notes</div>
            <h3>Seasonal tips, class dates & fresh arrivals.</h3>
            <p>A thoughtful note from Tammy, sent occasionally.</p>
          </div>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}
