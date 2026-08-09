import Link from 'next/link';
import { ArrowRight, CalendarDays, Leaf, PackageCheck, Sparkles } from 'lucide-react';
import NewsletterForm from '@/components/NewsletterForm';
import { db } from '@/lib/db';
import { FALLBACK_PRODUCT_IMAGE, formatMoney, productTypeLabel } from '@/lib/store';

export const dynamic = 'force-dynamic';

const collections = [
  {
    title: 'Hand-potted houseplants',
    description: 'Healthy plants and thoughtful planters selected to brighten real homes.',
    image: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=1000&q=85',
    href: '/shop?category=PLANT'
  },
  {
    title: 'Loose-leaf teas',
    description: 'Comforting blends and practical supplies for a slower everyday ritual.',
    image: 'https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?auto=format&fit=crop&w=1000&q=85',
    href: '/shop?category=TEA'
  },
  {
    title: 'Handmade botanicals',
    description: 'Small-batch soaps and lotions inspired by garden ingredients.',
    image: 'https://images.unsplash.com/photo-1607006483225-3f4b5308f95d?auto=format&fit=crop&w=1000&q=85',
    href: '/shop?category=SOAP'
  }
];

export default async function Home() {
  const [featured, upcomingClasses] = await Promise.all([
    db.product.findMany({
      where: { active: true, featured: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 3
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
      <section className="hero">
        <div className="container hero-inner">
          <div className="eyebrow">Grow beautifully</div>
          <h1>Plants, botanicals and a little know-how.</h1>
          <p>
            The Hillside Gardens is Tammy Hill’s collection of living plants, comforting teas,
            handmade goods and practical plant education.
          </p>
          <div className="actions">
            <Link className="btn gold" href="/shop">
              Explore the shop <ArrowRight size={17} />
            </Link>
            <Link className="btn light" href="/classes">
              Join a planter class
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="sectionhead">
            <div className="eyebrow">From the hillside</div>
            <h2>Things made to be enjoyed, shared and grown.</h2>
            <p>
              Find a new plant, settle in with a cup of tea, or discover a handmade botanical
              favorite.
            </p>
          </div>
          <div className="grid">
            {collections.map((collection) => (
              <article className="card" key={collection.title}>
                <Link href={collection.href}>
                  <img className="photo" src={collection.image} alt={collection.title} />
                </Link>
                <div className="cardbody">
                  <span className="pill">Hillside collection</span>
                  <h3>{collection.title}</h3>
                  <p>{collection.description}</p>
                  <Link className="text-link" href={collection.href}>
                    Shop the collection →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="section alt">
          <div className="container">
            <div className="sectionhead">
              <div className="eyebrow">Tammy’s featured picks</div>
              <h2>Current favorites from the shop.</h2>
              <p>Inventory shown here is live and updates as products are purchased.</p>
            </div>
            <div className="product-grid">
              {featured.map((product) => (
                <article className="product-card" key={product.id}>
                  <Link className="product-image-wrap" href={`/shop/${product.slug}`}>
                    {product.badge && <span className="product-badge">{product.badge}</span>}
                    <img src={product.imageUrl || FALLBACK_PRODUCT_IMAGE} alt={product.name} />
                  </Link>
                  <div className="product-copy">
                    <span className="pill">{productTypeLabel(product.type)}</span>
                    <h3><Link href={`/shop/${product.slug}`}>{product.name}</Link></h3>
                    <p>{product.shortDescription || product.description}</p>
                    <div className="product-actions">
                      <strong className="price">{formatMoney(product.priceCents)}</strong>
                      <Link className="btn small" href={`/shop/${product.slug}`}>View product</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="actions" style={{ justifyContent: 'center' }}>
              <Link className="btn outline" href="/shop">See everything in the shop</Link>
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container split">
          <img
            className="portrait"
            src="https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1200&q=88"
            alt="Lush potted garden plants"
          />
          <div>
            <div className="eyebrow">Meet Tammy</div>
            <h2>Helping people feel confident with plants.</h2>
            <p className="quote">
              “You don’t need a green thumb. You just need to understand what your plant is asking
              for.”
            </p>
            <p>
              Tammy Hill created The Hillside Gardens around a simple love of plants and sharing
              what she knows. Her hands-on planter classes make plant care approachable, social and
              fun.
            </p>
            <div className="actions">
              <Link className="btn" href="/about">Read Tammy’s story</Link>
              <Link className="btn outline" href="/care">Browse care sheets</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section forest">
        <div className="container">
          <div className="sectionhead">
            <div className="eyebrow">Why The Hillside Gardens</div>
            <h2>Practical guidance is part of every plant.</h2>
          </div>
          <div className="featuregrid">
            <div className="feature"><Leaf size={22} /><b>Chosen with care</b><span>Plants and goods selected in small, manageable batches.</span></div>
            <div className="feature"><Sparkles size={22} /><b>Made approachable</b><span>Clear care advice without confusing greenhouse language.</span></div>
            <div className="feature"><PackageCheck size={22} /><b>Prepared thoughtfully</b><span>Orders packed carefully and tracked from the owner dashboard.</span></div>
            <div className="feature"><CalendarDays size={22} /><b>Learn in person</b><span>Friendly planter workshops designed for beginners and groups.</span></div>
          </div>
        </div>
      </section>

      {upcomingClasses.length > 0 && (
        <section className="section alt">
          <div className="container">
            <div className="sectionhead">
              <div className="eyebrow">Hands-on with Tammy</div>
              <h2>Upcoming planter workshops.</h2>
            </div>
            <div className="grid two">
              {upcomingClasses.map((event) => {
                const reserved = event.registrations.reduce((total, registration) => total + registration.seats, 0);
                const seatsLeft = Math.max(0, event.capacity - reserved);
                return (
                  <article className="card class-card" key={event.id}>
                    {event.imageUrl && <img className="photo" src={event.imageUrl} alt={event.title} />}
                    <div className="cardbody">
                      <span className="pill">In person</span>
                      <h3>{event.title}</h3>
                      <p>{event.description}</p>
                      <div className="class-meta">
                        <span><b>{event.startsAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</b></span>
                        <span>{event.startsAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} • {event.location}</span>
                        <span>{seatsLeft} of {event.capacity} seats remaining</span>
                      </div>
                      <div className="product-actions">
                        <strong className="price">{formatMoney(event.priceCents)}</strong>
                        <Link className="btn small" href="/classes">View class</Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container newsletter">
          <div>
            <div className="eyebrow">The Hillside Notes</div>
            <h3>Seasonal tips, class dates and new arrivals.</h3>
            <p>Useful plant guidance and shop news, sent occasionally.</p>
          </div>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}
