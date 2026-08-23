import { NextResponse } from 'next/server';
import { recommendationsForBasket } from '@/lib/recommendation-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The cart drawer's "goes well with" strip.
 *
 * It used to answer with the shop's featured products, excluding whatever was
 * already in the basket — which meant a shopper buying soap was offered a
 * monstera because the monstera happened to be featured. Now the basket's own
 * contents pick the suggestion, through the same rules the product page uses,
 * and an empty answer is a perfectly good one: nothing beats a suggestion that
 * has nothing to do with what you are buying.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const slugList = (value: string | null) =>
      (value || '')
        .split(',')
        .map((slug) => slug.trim())
        .filter(Boolean)
        .slice(0, 50);

    const inBasket = slugList(params.get('exclude'));
    const sets = slugList(params.get('sets'));
    if (!inBasket.length && !sets.length) return NextResponse.json({ products: [] });

    return NextResponse.json({ products: await recommendationsForBasket(inBasket, sets) });
  } catch (error) {
    console.error('Unable to build cart recommendations', error);
    return NextResponse.json({ products: [] });
  }
}
