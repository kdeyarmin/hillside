import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Powers the "goes well with" strip in the cart drawer. */
export async function GET(request: Request) {
  try {
    const exclude = new URL(request.url).searchParams.get('exclude') || '';
    const excluded = exclude
      .split(',')
      .map((slug) => slug.trim())
      .filter(Boolean)
      .slice(0, 50);

    const products = await db.product.findMany({
      where: { active: true, inventory: { gt: 0 }, slug: { notIn: excluded } },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      take: 4,
      select: {
        slug: true,
        name: true,
        priceCents: true,
        imageUrl: true,
        inventory: true,
        type: true
      }
    });

    return NextResponse.json({ products });
  } catch (error) {
    console.error('Unable to build cart recommendations', error);
    return NextResponse.json({ products: [] });
  }
}
