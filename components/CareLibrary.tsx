'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  Droplets,
  Leaf,
  Search,
  Sparkles,
  SunMedium
} from 'lucide-react';
import ResilientImage from '@/components/ResilientImage';
import { FALLBACK_PRODUCT_IMAGE } from '@/lib/store';

type GuideType = 'PLANT' | 'GENERAL' | 'PROBLEM' | 'SEASONAL';
type FilterType = 'ALL' | GuideType;

export type CareLibraryGuide = {
  id: string;
  plantName: string;
  slug: string;
  guideType: GuideType;
  category: string | null;
  difficulty: string | null;
  botanical: string | null;
  summary: string;
  light: string | null;
  water: string | null;
  symptoms: string | null;
  imageUrl: string | null;
  featured: boolean;
};

const filters: Array<{ value: FilterType; label: string }> = [
  { value: 'ALL', label: 'All guides' },
  { value: 'PLANT', label: 'Plant profiles' },
  { value: 'GENERAL', label: 'Care basics' },
  { value: 'PROBLEM', label: 'Common issues' },
  { value: 'SEASONAL', label: 'Seasonal care' }
];

function guideLabel(type: GuideType) {
  if (type === 'GENERAL') return 'Care basics';
  if (type === 'PROBLEM') return 'Plant problem';
  if (type === 'SEASONAL') return 'Seasonal care';
  return 'Plant profile';
}

function GuideIcon({ type }: { type: GuideType }) {
  if (type === 'PROBLEM') return <AlertTriangle size={16} />;
  if (type === 'SEASONAL') return <CalendarRange size={16} />;
  if (type === 'GENERAL') return <Sparkles size={16} />;
  return <Leaf size={16} />;
}

export default function CareLibrary({ guides }: { guides: CareLibraryGuide[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('ALL');

  const counts = useMemo(() => {
    const count: Record<FilterType, number> = {
      ALL: guides.length,
      PLANT: 0,
      GENERAL: 0,
      PROBLEM: 0,
      SEASONAL: 0
    };
    for (const guide of guides) count[guide.guideType] += 1;
    return count;
  }, [guides]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return guides.filter((guide) => {
      if (filter !== 'ALL' && guide.guideType !== filter) return false;
      if (!needle) return true;
      return [
        guide.plantName,
        guide.botanical,
        guide.category,
        guide.difficulty,
        guide.summary,
        guide.light,
        guide.water,
        guide.symptoms
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [filter, guides, query]);

  return (
    <>
      <div className="care-library-tools">
        <label className="care-search">
          <Search size={20} aria-hidden="true" />
          <span className="sr-only">Search plant care guides</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search plants, symptoms, pests or care topics"
            inputMode="search"
            enterKeyHint="search"
          />
        </label>
        <div className="care-filter-row" role="group" aria-label="Filter care guides">
          {filters.map((item) => (
            <button
              type="button"
              className={filter === item.value ? 'active' : ''}
              onClick={() => setFilter(item.value)}
              key={item.value}
              aria-pressed={filter === item.value}
            >
              {item.label} <span>{counts[item.value]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="care-results-heading" aria-live="polite">
        <div>
          <span className="eyebrow">Tammy’s practical library</span>
          <h2>{visible.length} {visible.length === 1 ? 'guide' : 'guides'} found</h2>
        </div>
        {(query || filter !== 'ALL') && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setQuery('');
              setFilter('ALL');
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {visible.length > 0 ? (
        <div className="care-library-grid">
          {visible.map((guide) => (
            <article className={`care-guide-card care-type-${guide.guideType.toLowerCase()}`} key={guide.id}>
              <Link className="care-guide-image" href={`/care/${guide.slug}`}>
                {guide.featured && <span className="care-featured-badge">Tammy’s essential</span>}
                <ResilientImage
                  src={guide.imageUrl || FALLBACK_PRODUCT_IMAGE}
                  fallbackSrc="/images/botanical-placeholder.svg"
                  alt={guide.plantName}
                  width={900}
                  height={675}
                  loading="lazy"
                  decoding="async"
                />
              </Link>
              <div className="care-guide-copy">
                <div className="care-card-meta">
                  <span><GuideIcon type={guide.guideType} /> {guideLabel(guide.guideType)}</span>
                  {guide.category && <span>{guide.category}</span>}
                </div>
                <h3><Link href={`/care/${guide.slug}`}>{guide.plantName}</Link></h3>
                {guide.botanical && <p className="botanical">{guide.botanical}</p>}
                <p>{guide.summary}</p>

                {guide.guideType === 'PLANT' && (guide.light || guide.water) && (
                  <div className="care-card-quick">
                    {guide.light && <span><SunMedium size={15} /><b>Light</b>{guide.light}</span>}
                    {guide.water && <span><Droplets size={15} /><b>Water</b>{guide.water}</span>}
                  </div>
                )}

                {guide.guideType === 'PROBLEM' && guide.symptoms && (
                  <div className="care-symptom-preview">
                    <b>Look for:</b> {guide.symptoms}
                  </div>
                )}

                <div className="care-guide-footer">
                  {guide.difficulty && <span>{guide.difficulty}</span>}
                  <Link className="text-link" href={`/care/${guide.slug}`}>Read guide →</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="care-empty-state">
          <Leaf size={40} />
          <h3>No guides match that search.</h3>
          <p>Try a plant name, a symptom such as “yellow leaves,” or a topic such as watering or pests.</p>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setQuery('');
              setFilter('ALL');
            }}
          >
            Show all guides
          </button>
        </div>
      )}
    </>
  );
}
