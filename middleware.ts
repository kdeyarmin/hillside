import { NextResponse, type NextRequest } from 'next/server';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';

/**
 * Answers `/classes` with a real 404 while classes are hidden.
 *
 * The page itself already calls `notFound()`, and that renders the right thing —
 * but only the body. Measured against this build, `notFound()` from inside a
 * page returns the not-found markup with a **200**, while a genuinely unrouted
 * path returns 404. A 200 that says "page not found" is a soft 404: search
 * engines keep the URL indexed and keep crawling it, which is the opposite of
 * hiding it.
 *
 * Rewriting to a path that matches no route hands the request back to the
 * router, which produces the same styled page with the status it deserves. The
 * `notFound()` call in the page stays as the second line of defence.
 *
 * The matcher is the listing page alone. `/classes/access/<token>`,
 * `/classes/confirm/<token>`, `/classes/studio/<id>` and `/classes/success`
 * are reachable only with a token or a Stripe session and keep working for
 * customers who already registered.
 */
export function middleware(request: NextRequest) {
  if (CLASSES_PUBLICLY_VISIBLE) return NextResponse.next();
  return NextResponse.rewrite(new URL('/_classes-hidden', request.url));
}

export const config = {
  matcher: ['/classes']
};
