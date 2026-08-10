import Link from 'next/link';
import BrandMockupScene from '@/components/BrandMockupScene';
import GalleryGrid from '@/components/GalleryGrid';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Planter Gallery',
  description: 'Browse potted plant arrangements, container combinations and planter inspiration we have created.'
};

export default async function Gallery() {
  const items = await db.galleryItem.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
  return (
    <>
      <section className="pagehero">
        <div className="container"><div className="eyebrow">Past work and inspiration</div><h1>Planter gallery.</h1><p>A growing collection of arrangements, combinations and garden ideas from The Hillside Gardens.</p></div>
      </section>
      <section className="content">
        <div className="container">
          <BrandMockupScene
            variant="plants"
            className="picks-brand-scene"
            alt="Potted plants displayed with The Hillside Gardens logo and branded care card"
          />
          {items.length ? <GalleryGrid items={items.map(({ id, title, imageUrl, caption }) => ({ id, title, imageUrl, caption }))} /> : <div className="empty-state"><h3>Gallery coming soon.</h3><p>We are preparing photographs of past planter arrangements.</p></div>}
          <div className="newsletter" style={{ marginTop: 55 }}><div><div className="eyebrow">Have something in mind?</div><h3>Ask us about a custom arrangement.</h3></div><Link className="btn gold" href="/contact">Start a conversation</Link></div>
        </div>
      </section>
    </>
  );
}
