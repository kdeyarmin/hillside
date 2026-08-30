import { NextResponse } from 'next/server';
import { rateLimited } from '@/lib/rate-limit';
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
  /**
   * The last public route with no limit on it. Nothing here writes, sends or
   * charges anything, so what is being protected is the work: each call runs the
   * basket through the same set of catalog queries a product page does, and an
   * anonymous caller could hold the database busy doing it for free.
   *
   * The ceiling is set well above any shopper because nobody asks for this — the
   * cart drawer does, on its own, every time it opens and again whenever the
   * basket's contents change while it is open. Twelve of those a minute, kept up
   * for ten minutes, is not a person browsing; a refusal reaching a real
   * customer is the more expensive mistake, and it would land silently, since a
   * shopper is never told these suggestions were meant to be there.
   */
  if (await rateLimited(request, { name: 'recommendations', limit: 120, windowMs: 10 * 60_000 })) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes and try again.' },
      { status: 429 }
    );
  }

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
