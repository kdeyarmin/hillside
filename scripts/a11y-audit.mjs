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

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const context = await browser.newContext();
const failures = [];

for (const route of routes) {
  const page = await context.newPage();
  await page.goto(`${baseURL}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
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
      console.log(`  [${violation.impact}] ${violation.id} — ${violation.help} (${violation.nodes.length})`);
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
console.log(`\n${total} violation type(s) across ${failures.length} of ${routes.length} routes.`);
process.exit(total > 0 ? 1 : 0);
