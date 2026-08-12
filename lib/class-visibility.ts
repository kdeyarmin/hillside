// Relative and extensioned rather than the usual `@/lib/store`: `npm test` runs
// these modules through node directly, which resolves neither tsconfig path
// aliases nor extensionless files. `allowImportingTsExtensions` covers the rest.
import { siteBaseUrl } from './store.ts';

/**
 * One switch that decides whether classes exist for a customer.
 *
 * Classes are currently hidden from the public website. Nothing about the class
 * machinery has been removed: the dashboard still creates and edits classes, the
 * Stripe checkout and free-registration endpoints still run, seats are still
 * counted and held, confirmation email still sends, and the private Telnyx
 * classroom still opens for anyone holding a valid link. Only the storefront
 * surfaces are gone — the header and footer links, the homepage section, search
 * results, the care-guide cross-link, the sitemap entry and the `/classes`
 * listing page itself, which now answers 404.
 *
 * Setting this back to `true` restores every one of those in place. It is
 * annotated `boolean` rather than left to infer the literal `false` on purpose:
 * without the annotation TypeScript narrows the type, and every guard below it
 * becomes provably dead code that the compiler and the linter then complain
 * about — which is exactly the state a temporary flag must not be in.
 *
 * The one thing flipping this back will not restore is copy. Sentences that
 * advertised classes on the home, about, FAQ, contact and search pages were
 * rewritten rather than wrapped in a conditional, because prose interleaved with
 * flag checks is unreadable. Re-enabling classes means writing that copy again.
 */
export const CLASSES_PUBLICLY_VISIBLE: boolean = false;

/**
 * Where the private classroom pages send someone who has nowhere left to go —
 * an expired room, a link that no longer resolves, a finished registration.
 *
 * Those pages are reachable only with a token or a Stripe session id, so they
 * outlive the public listing on purpose: a customer who already paid can still
 * get into the class they paid for. What they cannot do is offer a button back
 * to `/classes` while that page answers 404, so the exit points at the contact
 * page instead, which is what the emails and the alerts already tell people to
 * use when a link stops working.
 */
export const CLASSES_EXIT_LINK: { href: string; label: string } = CLASSES_PUBLICLY_VISIBLE
  ? { href: '/classes', label: 'View available classes' }
  : { href: '/contact', label: 'Contact us' };

/**
 * Whether an owner-entered link leads to the hidden classes page.
 *
 * Gallery items carry a link typed into the dashboard, so one of them can point
 * at a class. Code can be gated; a row in the database cannot, and a caption
 * offering "See the class" over a 404 is exactly what hiding classes is meant to
 * prevent. Only the shop's own paths count — an outside URL that happens to end
 * in `/classes` belongs to someone else and is left alone.
 */
export function pointsAtHiddenClasses(url: string | null | undefined): boolean {
  if (CLASSES_PUBLICLY_VISIBLE || !url) return false;

  const trimmed = url.trim();
  if (!trimmed) return false;

  let path = trimmed;
  if (!path.startsWith('/')) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.host !== new URL(siteBaseUrl()).host) return false;
      path = parsed.pathname;
    } catch {
      return false;
    }
  }

  const withoutQuery = path.split(/[?#]/)[0].replace(/\/+$/, '');
  return withoutQuery === '/classes' || withoutQuery.startsWith('/classes/');
}
