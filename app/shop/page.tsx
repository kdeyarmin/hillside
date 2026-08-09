import ShopClient from '@/components/ShopClient';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Shop Plants, Teas & Botanicals',
  description: 'Shop potted plants, loose-leaf tea, tea supplies, handmade soap and botanical lotion from The Hillside Gardens.'
};

export default async function Shop({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const params = await searchParams;
  const products = await db.product.findMany({
    where: { active: true },
    orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }]
  });

  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Plants • Teas • Botanicals</div>
          <h1>Shop The Hillside.</h1>
          <p>Hand-selected plants and small-batch goods from Tammy’s garden-inspired collection.</p>
        </div>
      </section>
      <section className="content">
        <div className="container">
          <ShopClient products={products} initialCategory={params.category || 'ALL'} />
        </div>
      </section>
    </>
  );
}
