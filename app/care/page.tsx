import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Droplets,
  Leaf,
  SearchCheck,
  Sprout,
  SunMedium
} from 'lucide-react';
import BrandMockupScene from '@/components/BrandMockupScene';
import CareLibrary from '@/components/CareLibrary';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Plant Care Library & Plant Problem Guide',
  description:
    'Practical plant profiles, watering and light guidance, seasonal checklists, pest help and troubleshooting for common houseplant problems from The Hillside Gardens.'
};

const quickStarts = [
  {
    title: 'Watering without guesswork',
    description: 'Learn when to water, how deeply to water and why a calendar is not enough.',
    href: '/care/watering-houseplants-101',
    icon: Droplets
  },
  {
    title: 'Understand your light',
    description: 'Translate window direction, distance and direct sun into useful plant placement.',
    href: '/care/understanding-indoor-light',
    icon: SunMedium
  },
  {
    title: 'Find the cause of yellow leaves',
    description: 'Use the location, texture and pattern of yellowing to narrow the problem.',
    href: '/care/yellow-leaves',
    icon: AlertTriangle
  },
  {
    title: 'Build strong roots',
    description: 'Choose the right soil, drainage and pot size before problems begin.',
    href: '/care/soil-drainage-and-pots',
    icon: Sprout
  }
];

const symptomLinks = [
  ['Yellow leaves', '/care/yellow-leaves'],
  ['Brown tips', '/care/brown-tips-crispy-edges'],
  ['Drooping', '/care/drooping-wilting-houseplants'],
  ['Curling leaves', '/care/curling-leaves'],
  ['Leggy growth', '/care/leggy-growth-small-leaves'],
  ['Root rot', '/care/root-rot'],
  ['Fungus gnats', '/care/fungus-gnats'],
  ['Spider mites', '/care/spider-mites'],
  ['Mealybugs or scale', '/care/mealybugs-and-scale'],
  ['Mold on soil', '/care/mold-mushrooms-algae-on-soil']
] as const;

export default async function Care() {
  const guides = await db.careSheet.findMany({
    where: { published: true },
    orderBy: [
      { featured: 'desc' },
      { guideType: 'asc' },
      { sortOrder: 'asc' },
      { plantName: 'asc' }
    ],
    select: {
      id: true,
      plantName: true,
      slug: true,
      guideType: true,
      category: true,
      difficulty: true,
      botanical: true,
      summary: true,
      light: true,
      water: true,
      symptoms: true,
      imageUrl: true,
      featured: true
    }
  });

  const plantProfiles = guides.filter((guide) => guide.guideType === 'PLANT').length;
  const problemGuides = guides.filter((guide) => guide.guideType === 'PROBLEM').length;
  const learningGuides = guides.filter((guide) =>
    guide.guideType === 'GENERAL' || guide.guideType === 'SEASONAL'
  ).length;

  return (
    <>
      <section className="pagehero care-pagehero">
        <div className="container care-hero-grid">
          <div>
            <div className="eyebrow">Our plant care library</div>
            <h1>Plant care that makes sense in a real home.</h1>
            <p>
              Start with a plant profile, learn the basics, or troubleshoot a symptom with practical
              steps that help you decide what to check next.
            </p>
            <div className="care-library-stats" aria-label="Plant care library contents">
              <span><Leaf size={18} /><b>{plantProfiles}</b> plant profiles</span>
              <span><AlertTriangle size={18} /><b>{problemGuides}</b> problem guides</span>
              <span><SearchCheck size={18} /><b>{learningGuides}</b> care lessons</span>
            </div>
          </div>
          <BrandMockupScene variant="care" />
        </div>
      </section>

      <section className="care-quick-start-section">
        <div className="container">
          <div className="sectionhead">
            <div className="eyebrow">Start with the essentials</div>
            <h2>Four guides that prevent most houseplant problems.</h2>
            <p>Strong light decisions, thoughtful watering and healthy roots solve more than any quick fix.</p>
          </div>
          <div className="care-quick-start-grid">
            {quickStarts.map(({ title, description, href, icon: Icon }) => (
              <Link href={href} className="care-quick-start-card" key={href}>
                <Icon size={27} />
                <h3>{title}</h3>
                <p>{description}</p>
                <span>Read guide <ArrowRight size={15} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="care-plant-doctor">
        <div className="container care-plant-doctor-inner">
          <div>
            <div className="eyebrow">Plant doctor</div>
            <h2>What are you noticing?</h2>
            <p>
              Choose the symptom that looks closest. Plant symptoms overlap, so each guide begins
              with simple checks before recommending a treatment.
            </p>
          </div>
          <div className="care-symptom-links">
            {symptomLinks.map(([label, href]) => (
              <Link href={href} key={href}>{label}<ArrowRight size={14} /></Link>
            ))}
          </div>
        </div>
      </section>

      <section className="content care-library-content">
        <div className="container">
          {guides.length > 0 ? (
            <CareLibrary guides={guides} />
          ) : (
            <div className="care-empty-state">
              <Leaf size={42} />
              <h3>Our care library is growing.</h3>
              <p>The starter care library has not been loaded into the database yet.</p>
              <Link className="btn" href="/admin/care">Open care-library manager</Link>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
