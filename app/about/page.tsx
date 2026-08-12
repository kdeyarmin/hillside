import Link from 'next/link';
import { BookOpen, Heart, Leaf, Users } from 'lucide-react';
import BrandMockupScene from '@/components/BrandMockupScene';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/about',
  title: 'About Tammy Hill',
  description:
    'Meet Tammy Hill, the plant lover and teacher behind The Hillside Gardens.',
  image: '/images/scenes/potting-bench.webp'
});

export default function About() {
  return (
    <>
      <section className="pagehero">
        <div className="container"><div className="eyebrow">Rooted in a love of plants</div><h1>Meet Tammy Hill.</h1><p>The plant lover, teacher and maker behind The Hillside Gardens.</p></div>
      </section>
      <section className="content">
        <div className="container split">
          <BrandMockupScene variant="about" className="portrait about-brand-scene" />
          <div>
            <div className="eyebrow">The Hillside story</div>
            <h2 className="display-title" style={{ fontSize: 50, color: 'var(--forest)', margin: '8px 0 18px' }}>Plants should feel joyful, not intimidating.</h2>
            <p>Tammy built The Hillside Gardens around two things she genuinely loves: growing beautiful plants and helping other people succeed with them.</p>
            <p>Our in-person planter classes focus on the practical questions that make the biggest difference — which plants belong together, how to arrange them, what soil and container to use, and how to keep the finished planter healthy once it gets home.</p>
            <p>The shop extends that same approach into hand-potted plants, teas and tea supplies, handmade lotions and soaps, and carefully selected botanical goods.</p>
            <p><b>The goal is simple:</b> send people home with something beautiful and the confidence to care for it.</p>
            <div className="actions"><Link className="btn" href="/classes">Join us for a class</Link><Link className="btn outline" href="/contact">Ask us a question</Link></div>
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="container">
          <div className="sectionhead"><div className="eyebrow">What guides the business</div><h2>Care, confidence and real connection.</h2></div>
          <div className="featuregrid">
            <div className="feature"><Heart size={22} /><b>Carefully chosen</b><span>Small batches make it possible to pay attention to quality and presentation.</span></div>
            <div className="feature"><BookOpen size={22} /><b>Clearly explained</b><span>Plant education is practical, friendly and designed for everyday homes.</span></div>
            <div className="feature"><Users size={22} /><b>Better together</b><span>Classes turn learning into a relaxed social experience.</span></div>
            <div className="feature"><Leaf size={22} /><b>Rooted in growth</b><span>The shop and care library will continue growing with our community.</span></div>
          </div>
        </div>
      </section>
    </>
  );
}
