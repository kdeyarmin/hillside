/**
 * Runs axe-core over the public routes and reports WCAG violations.
 *
 * Complements scripts/responsive-audit.mjs, which measures layout: this one reads
 * the accessibility tree. Both are needed — the defects this was written to catch
 * (a rating whose only label sat on a role-less span, a live region that did not
 * exist until it had something to announce) are invisible to a layout check and
 * to a visual review alike.
 *
 *   AUDIT_BASE_URL=http://127.0.0.1:3000 node scripts/a11y-audit.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

const baseURL = (process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const routes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      '/',
      '/shop',
      '/shop/monstera-deliciosa',
      '/collections',
      '/collections/plants',
      '/gifts',
      '/gifts/under-50',
      // '/classes' is hidden from the storefront (lib/class-visibility.ts) and
      // answers 404; restore this line with the flag.
      '/care',
      '/care/monstera-deliciosa',
      '/gallery',
      '/amazon',
      '/about',
      '/contact',
      '/cart',
      '/faq',
      '/order-status',
      '/search?q=monstera',
      '/shipping-returns',
      '/privacy',
      '/terms',
      /* The sign-in form is the one page an owner cannot get past, so its labels
         and its error message have to be reachable. The error code is what makes
         that true: without one the page renders the plain form and the
         `role="alert"` branch is never in the tree to be audited. */
      '/admin?error=1'
    ];

/**
 * Routes that name one specific catalog record. Several of the defaults above
 * hardcode a slug, so a renamed product or a retired collection turns them into
 * 404s without anything else changing — worth saying so in the failure, because
 * the fix is in the catalog or in the list above, not in the page.
 */
const namesACatalogRecord = (route) => /^\/(shop|collections|gifts|care)\/[^/?]/.test(route);

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const context = await browser.newContext();
const failures = [];
const unreachable = [];

for (const route of routes) {
  const page = await context.newPage();
  const response = await page.goto(`${baseURL}${route}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });

  /**
   * The status was never read, so the audit scanned whatever the server
   * answered with: a route whose slug had left the catalog rendered the
   * not-found page, axe found nothing wrong with that page, and the run
   * reported the route "clean". A route that does not load is a failure of the
   * audit, not a pass, and it is not scanned — there is no point auditing a
   * page nobody can reach.
   */
  const status = response?.status() ?? 0;
  if (status < 200 || status > 299) {
    unreachable.push({ url: `${baseURL}${route}`, status });
    console.log(
      `\n${route} — NOT AUDITED: ${baseURL}${route} answered HTTP ${status || 'no response'}${
        namesACatalogRecord(route)
          ? '\n      That slug may no longer exist in the catalog. Check it, then fix the catalog or update the route list in this script.'
          : ''
      }`
    );
    await page.close();
    continue;
  }

  await page.addScriptTag({ path: axePath });

  const results = await page.evaluate(async () =>
    // @ts-expect-error injected at runtime
    window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }
    })
  );

  const violations = results.violations.filter((v) => v.impact !== 'minor' || v.nodes.length > 0);
  if (violations.length) {
    failures.push({ route, violations });
    console.log(`\n${route}`);
    for (const violation of violations) {
      console.log(
        `  [${violation.impact}] ${violation.id} — ${violation.help} (${violation.nodes.length})`
      );
      for (const node of violation.nodes.slice(0, 3)) {
        console.log(`      ${node.html.slice(0, 130).replace(/\s+/g, ' ')}`);
      }
    }
  } else {
    console.log(`${route} — clean`);
  }
  await page.close();
}

await browser.close();

const total = failures.reduce((sum, f) => sum + f.violations.length, 0);
const audited = routes.length - unreachable.length;
console.log(`\n${total} violation type(s) across ${failures.length} of ${audited} audited routes.`);

if (unreachable.length) {
  console.log(
    `\n${unreachable.length} of ${routes.length} route(s) did not load and were NOT audited:`
  );
  for (const item of unreachable) {
    console.log(`  HTTP ${item.status || 'no response'} — ${item.url}`);
  }
}

process.exit(total > 0 || unreachable.length > 0 ? 1 : 0);
