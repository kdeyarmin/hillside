'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  Droplets,
  Leaf,
  Search,
  Sparkles,
  Sprout,
  SunMedium
} from 'lucide-react';
import ResilientImage from '@/components/ResilientImage';
import { matchesAnySearchField } from '@/lib/search';
import { FALLBACK_PRODUCT_IMAGE } from '@/lib/store';

import { careGuideTypeLabel, type CareGuideTypeName } from '@/lib/care-guides';

type GuideType = CareGuideTypeName;
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

/* Beginner guides sit second, straight after the plant profiles: someone
   arriving on the library with no plants yet is the reader most in need of a
   shelf they can start from. */
const filters: Array<{ value: FilterType; label: string }> = [
  { value: 'ALL', label: 'All guides' },
  { value: 'PLANT', label: 'Plant profiles' },
  { value: 'BEGINNER', label: 'Start here' },
  { value: 'GENERAL', label: 'Care basics' },
  { value: 'PROBLEM', label: 'Common issues' },
  { value: 'SEASONAL', label: 'Seasonal care' }
];

function GuideIcon({ type }: { type: GuideType }) {
  if (type === 'PROBLEM') return <AlertTriangle size={16} />;
  if (type === 'SEASONAL') return <CalendarRange size={16} />;
  if (type === 'GENERAL') return <Sparkles size={16} />;
  if (type === 'BEGINNER') return <Sprout size={16} />;
  return <Leaf size={16} />;
}

/** Rendering all 36 guides at once made a 12,000px page and 36 image requests. */
const PAGE_SIZE = 12;

export default function CareLibrary({ guides }: { guides: CareLibraryGuide[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const counts = useMemo(() => {
    const count: Record<FilterType, number> = {
      ALL: guides.length,
      PLANT: 0,
      BEGINNER: 0,
      GENERAL: 0,
      PROBLEM: 0,
      SEASONAL: 0
    };
    // Guarded because `guideType` arrives from the database: a kind added to the
    // schema but not to this list would otherwise crash the whole library on
    // `undefined + 1` rather than merely go uncounted.
    for (const guide of guides) {
      if (guide.guideType in count) count[guide.guideType] += 1;
    }
    return count;
  }, [guides]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [filter, query]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return guides.filter((guide) => {
      if (filter !== 'ALL' && guide.guideType !== filter) return false;
      if (!needle) return true;
      return matchesAnySearchField(
        [
          guide.plantName,
          guide.botanical,
          guide.category,
          guide.difficulty,
          guide.summary,
          guide.light,
          guide.water,
          guide.symptoms
        ],
        needle
      );
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
          <span className="eyebrow">Our practical library</span>
          <h2>
            {visible.length} {visible.length === 1 ? 'guide' : 'guides'} found
          </h2>
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
          {visible.slice(0, limit).map((guide, index) => (
            <article
              className={`care-guide-card care-type-${guide.guideType.toLowerCase()}`}
              key={guide.id}
            >
              <Link className="care-guide-image" href={`/care/${guide.slug}`}>
                {guide.featured && <span className="care-featured-badge">Our essential</span>}
                <ResilientImage
                  sizeRole="card"
                  src={guide.imageUrl || FALLBACK_PRODUCT_IMAGE}
                  fallbackSrc="/images/botanical-placeholder.svg"
                  alt={`${guide.plantName} — ${careGuideTypeLabel(guide.guideType).toLowerCase()}`}
                  width={900}
                  height={675}
                  loading={index < 2 ? 'eager' : 'lazy'}
                  fetchPriority={index < 2 ? 'high' : undefined}
                  decoding="async"
                />
              </Link>
              <div className="care-guide-copy">
                <div className="care-card-meta">
                  <span>
                    <GuideIcon type={guide.guideType} /> {careGuideTypeLabel(guide.guideType)}
                  </span>
                  {guide.category && <span>{guide.category}</span>}
                </div>
                <h3>
                  <Link href={`/care/${guide.slug}`}>{guide.plantName}</Link>
                </h3>
                {guide.botanical && <p className="botanical">{guide.botanical}</p>}
                <p>{guide.summary}</p>

                {guide.guideType === 'PLANT' && (guide.light || guide.water) && (
                  <div className="care-card-quick">
                    {guide.light && (
                      <span>
                        <SunMedium size={15} />
                        <b>Light</b>
                        {guide.light}
                      </span>
                    )}
                    {guide.water && (
                      <span>
                        <Droplets size={15} />
                        <b>Water</b>
                        {guide.water}
                      </span>
                    )}
                  </div>
                )}

                {guide.guideType === 'PROBLEM' && guide.symptoms && (
                  <div className="care-symptom-preview">
                    <b>Look for:</b> {guide.symptoms}
                  </div>
                )}

                <div className="care-guide-footer">
                  {guide.difficulty && <span>{guide.difficulty}</span>}
                  <Link className="text-link" href={`/care/${guide.slug}`}>
                    Read guide →
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="care-empty-state">
          <Leaf size={40} />
          <h3>No guides match that search.</h3>
          <p>
            Try a plant name, a symptom such as “yellow leaves,” or a topic such as watering or
            pests.
          </p>
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

      {visible.length > limit && (
        <div className="care-load-more">
          <p className="muted">
            Showing {limit} of {visible.length} guides.
          </p>
          <button className="btn outline" type="button" onClick={() => setLimit(visible.length)}>
            Show all {visible.length} guides
          </button>
        </div>
      )}
    </>
  );
}
