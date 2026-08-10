import Link from 'next/link';
import { ArrowRight, Heart, Leaf, Package, Sparkles, Sprout } from 'lucide-react';
import BrandMockupScene, {
  type BrandMockupVariant,
  type HillsideCatalogImage
} from '@/components/BrandMockupScene';
import BrandedProductVisual from '@/components/BrandedProductVisual';
import NewsletterForm from '@/components/NewsletterForm';
import { classFormatLabel, classLocationLabel, isOnlineClass } from '@/lib/class-access';
import { db } from '@/lib/db';
import { formatMoney, productTypeLabel } from '@/lib/store';

export const dynamic = 'force-dynamic';

const collections: Array<{
  title: string;
  subtitle: string;
  variant: BrandMockupVariant;
  catalogImage: HillsideCatalogImage;
  href: string;
}> = [
  {
    title: 'House Plants',
    subtitle: 'Living beauty for every room',
    variant: 'plants',
    catalogImage: 'house-plants',
    href: '/shop?category=PLANT'
  },
  {
    title: 'Carnivorous Plants',
    subtitle: 'Wild, unusual & wonderfully alive',
    variant: 'plants',
    catalogImage: 'carnivorous-plants',
    href: '/shop?category=PLANT'
  },
  {
    title: 'Live Plant Planters',
    subtitle: 'Arrangements made to feel at home',
    variant: 'plants',
    catalogImage: 'live-plant-planters',
    href: '/shop?category=PLANT'
  },
  {
    title: 'Succulents',
    subtitle: 'Sculptural greens in easygoing forms',
    variant: 'plants',
    catalogImage: 'succulents',
    href: '/shop?category=PLANT'
  },
  {
    title: 'Air Plants',
    subtitle: 'Small plants with big personality',
    variant: 'plants',
    catalogImage: 'air-plants',
    href: '/shop?category=PLANT'
  },
  {
    title: 'Homemade Soaps',
    subtitle: 'Small-batch botanical bars',
    variant: 'botanicals',
    catalogImage: 'homemade-soaps',
    href: '/shop?category=SOAP'
  },
  {
    title: 'Moss',
    subtitle: 'Natural texture for creative projects',
    variant: 'picks',
    catalogImage: 'moss',
    href: '/shop'
  },
  {
    title: 'Driftwood',
    subtitle: 'One-of-a-kind natural forms',
    variant: 'picks',
    catalogImage: 'driftwood',
    href: '/shop'
  },
  {
    title: 'Apothecary',
    subtitle: 'Thoughtful botanical goods & rituals',
    variant: 'botanicals',
    catalogImage: 'apothecary',
    href: '/shop'
  },
  {
    title: 'Terrarium Supplies',
    subtitle: 'Everything for a tiny living world',
    variant: 'picks',
    catalogImage: 'terrarium-supplies',
    href: '/shop'
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
        <BrandMockupScene variant="hero" className="editorial-hero-image" />
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
              <Link className="editorial-collection" href={collection.href} key={collection.title}>
                <BrandMockupScene
                  variant={collection.variant}
                  catalogImage={collection.catalogImage}
                  alt={`${collection.title} from The Hillside Gardens in branded product photography`}
                />
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
        <section className="section editorial-products home-products-section">
          <div className="container">
            <div className="editorial-heading-row">
              <div>
                <div className="eyebrow">New & noteworthy</div>
                <h2>Our current favorites.</h2>
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
                    <BrandedProductVisual
                      slug={product.slug}
                      name={product.name}
                      type={product.type}
                      imageUrl={product.imageUrl}
                    />
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

      <section className="section tammy-story home-story-section">
        <div className="container split">
          <div className="story-photo">
            <BrandMockupScene variant="about" />
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
            <div className="grid two">
              {upcomingClasses.map((event) => {
                const reserved = event.registrations.reduce(
                  (total, registration) => total + registration.seats,
                  0
                );
                const seatsLeft = Math.max(0, event.capacity - reserved);
                const online = isOnlineClass(event.format);

                return (
                  <article className="class-editorial" key={event.id}>
                    <BrandMockupScene
                      variant="class"
                      backgroundSrc={event.imageUrl || undefined}
                      alt={`${event.title} workshop materials branded for The Hillside Gardens`}
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
