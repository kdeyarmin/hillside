import BundleCard from '@/components/BundleCard';
import type { BundleCardData } from '@/lib/bundle-queries';

/**
 * A shelf of sets, in the same grid products use.
 *
 * The `sparse` modifier is the reason this exists rather than a bare `<div
 * className="product-grid">` at each call site. Most of the places sets appear
 * show one or two — the "other kits" rail under a set, the kit a care guide
 * points at, the sets containing the product you are looking at — and a lone
 * card in a three-column track sits stranded against the left margin looking
 * like a row that failed to load. `ProductGrid` has always centred that case;
 * six call sites had each opened the div by hand and none of them did.
 */
export default function BundleGrid({
  bundles,
  eagerCount = 0
}: {
  bundles: BundleCardData[];
  /** How many leading cards to load eagerly, for a grid above the fold. */
  eagerCount?: number;
}) {
  if (!bundles.length) return null;
  return (
    <div className={`product-grid${bundles.length < 3 ? ' sparse' : ''}`}>
      {bundles.map((bundle, index) => (
        <BundleCard bundle={bundle} key={bundle.slug} priority={index < eagerCount} />
      ))}
    </div>
  );
}
