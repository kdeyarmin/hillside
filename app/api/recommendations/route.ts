import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CARD_SELECT = {
  slug: true,
  name: true,
  priceCents: true,
  imageUrl: true,
  inventory: true,
  type: true,
  ships: true,
  pickup: true,
  sizes: true,
  sizeLabel: true
} as const;

/**
 * Powers the "goes well with" strip in the cart drawer.
 *
 * The `exclude` list is what is already in the basket, which makes it the best
 * signal the cart has: rather than offering the same four featured products to
 * everyone, this leads with the cross-sells Tammy attached to the things the
 * shopper is actually buying — the potting mix beside the plant, the soap that
 * goes with the tea. Featured stock only fills whatever is left.
 */
export async function GET(request: Request) {
  try {
    const exclude = new URL(request.url).searchParams.get('exclude') || '';
    const inCart = exclude
      .split(',')
      .map((slug) => slug.trim())
      .filter(Boolean)
      .slice(0, 50);

    const sellable = { active: true, inventory: { gt: 0 }, slug: { notIn: inCart } } as const;

    const crossSells = inCart.length
      ? await db.product.findMany({
          where: {
            ...sellable,
            // Both directions, so a link made from either product counts.
            OR: [
              { crossSellFor: { some: { slug: { in: inCart } } } },
              { crossSells: { some: { slug: { in: inCart } } } }
            ]
          },
          orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
          take: 4,
          select: CARD_SELECT
        })
      : [];

    const remaining = 4 - crossSells.length;
    const filler = remaining
      ? await db.product.findMany({
          where: {
            ...sellable,
            slug: { notIn: [...inCart, ...crossSells.map((product) => product.slug)] }
          },
          orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
          take: remaining,
          select: CARD_SELECT
        })
      : [];

    return NextResponse.json({ products: [...crossSells, ...filler] });
  } catch (error) {
    console.error('Unable to build cart recommendations', error);
    return NextResponse.json({ products: [] });
  }
}
