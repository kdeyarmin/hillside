import Link from 'next/link';
import { Package } from 'lucide-react';
import AddBundleButton from '@/components/AddBundleButton';
import ResilientImage from '@/components/ResilientImage';
import { bundleStockNote } from '@/lib/bundles';
import type { BundleCardData } from '@/lib/bundle-queries';
import { formatMoney, resolveImageUrl } from '@/lib/store';

/**
 * A set on a shelf of them. It leads with what is in the box, because that is
 * the only thing that explains the price — a shopper who cannot see the contents
 * has no way to judge whether $38 is a bargain or not.
 */
export default function BundleCard({
  bundle,
  priority = false
}: {
  bundle: BundleCardData;
  priority?: boolean;
}) {
  const soldOut = bundle.sets <= 0;
  const included = bundle.items.filter((item) => !item.optional || !item.short);

  return (
    <article className="bundle-card">
      <Link className="product-image-wrap" href={`/bundles/${bundle.slug}`}>
        <span className="product-badges">
          {bundle.savingsNote && <span className="product-badge sale">{bundle.savingsNote}</span>}
          {bundle.badge && <span className="product-badge">{bundle.badge}</span>}
        </span>
        <ResilientImage
          sizeRole="card"
          src={resolveImageUrl(bundle.imageUrl)}
          fallbackSrc="/images/botanical-placeholder.svg"
          alt={bundle.title}
          width={640}
          height={560}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
        />
      </Link>
      <div className="product-copy">
        <span className="pill">
          <Package size={13} aria-hidden="true" /> Set
        </span>
        <h3>
          <Link href={`/bundles/${bundle.slug}`}>{bundle.title}</Link>
        </h3>
        <p>{bundle.tagline || bundle.description}</p>
        <ul className="bundle-contents">
          {included.map((item) => (
            <li key={`${item.slug}-${item.size || ''}`}>
              <Link href={`/shop/${item.slug}`}>{item.name}</Link>
              {item.size && <span className="bundle-variant"> · {item.size}</span>}
              {item.quantity > 1 && <span className="bundle-variant"> × {item.quantity}</span>}
            </li>
          ))}
        </ul>
        <p>
          <strong className="price">{formatMoney(bundle.priceCents)}</strong>
          {bundle.savingsCents > 0 && (
            <span className="compare-price">
              <span className="sr-only">Bought separately </span>
              {formatMoney(bundle.valueCents)}
            </span>
          )}
        </p>
        {/* Counted in sets, not pieces: the components have their own counts on
            their own pages, and "12 available" on a box of four things would be
            a number about nothing the shopper can buy here. */}
        <span className={`stock ${soldOut ? 'out' : bundle.sets <= 3 ? 'low' : ''}`}>
          {bundleStockNote(bundle.sets)}
        </span>
        <div className="product-actions">
          <Link className="text-link" href={`/bundles/${bundle.slug}`}>
            What&rsquo;s inside
          </Link>
          <AddBundleButton bundle={bundle} compact />
        </div>
      </div>
    </article>
  );
}
