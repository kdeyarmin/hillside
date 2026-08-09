import Link from 'next/link';
import { Droplets, SunMedium } from 'lucide-react';
import { db } from '@/lib/db';
import { FALLBACK_PRODUCT_IMAGE } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Houseplant Care Library',
  description: 'Simple, practical houseplant care sheets from Tammy Hill covering light, water, soil, humidity, feeding, temperature and pet safety.'
};

export default async function Care() {
  const sheets = await db.careSheet.findMany({
    where: { published: true },
    orderBy: { plantName: 'asc' }
  });

  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Tammy’s plant care library</div>
          <h1>Grow with confidence.</h1>
          <p>Simple, practical care sheets for common houseplants — written for real homes, not greenhouses.</p>
        </div>
      </section>
      <section className="content">
        <div className="container">
          {sheets.length > 0 ? (
            <div className="care-grid">
              {sheets.map((sheet) => (
                <article className="care-card" key={sheet.slug}>
                  <Link href={`/care/${sheet.slug}`}>
                    <img
                      className="photo"
                      style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 14 }}
                      src={sheet.imageUrl || FALLBACK_PRODUCT_IMAGE}
                      alt={sheet.plantName}
                    />
                  </Link>
                  <span className="pill" style={{ marginTop: 18 }}>Care sheet</span>
                  <h2><Link href={`/care/${sheet.slug}`}>{sheet.plantName}</Link></h2>
                  {sheet.botanical && <div className="botanical">{sheet.botanical}</div>}
                  <p>{sheet.summary}</p>
                  <div className="care-quick">
                    <span><SunMedium size={14} /> <b>Light</b><br />{sheet.light}</span>
                    <span><Droplets size={14} /> <b>Water</b><br />{sheet.water}</span>
                  </div>
                  <Link className="text-link" href={`/care/${sheet.slug}`}>Read the full care sheet →</Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>Tammy’s care library is growing.</h3>
              <p>New houseplant guides will be published here soon.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
