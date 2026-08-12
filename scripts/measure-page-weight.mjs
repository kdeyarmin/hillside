/**
 * Measures what a phone actually downloads for a page, by resource type.
 *
 * Written to hold the responsive-image work to a real number rather than an
 * assertion: run it before a change, run it after, compare. Transferred size is
 * read from the response body, so a variant that is smaller only because it is
 * cached does not flatter the result — the run is a cold load every time.
 */
import { chromium, devices } from 'playwright';

const baseURL = (process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const routes = process.argv.slice(2);
if (!routes.length) {
  console.error('Usage: node scripts/measure-page-weight.mjs <route> [route...]');
  process.exit(1);
}

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const context = await browser.newContext({
  ...devices['iPhone 13'],
  // Cold every time: a warm cache would silently hide a regression.
  bypassCSP: true
});

const totals = [];

for (const route of routes) {
  const page = await context.newPage();
  const seen = new Map();

  page.on('response', async (response) => {
    const request = response.request();
    const type = request.resourceType();
    try {
      const body = await response.body();
      const key = response.url();
      if (!seen.has(key)) seen.set(key, { type, bytes: body.length, url: key });
    } catch {
      // Redirects and aborted requests have no readable body.
    }
  });

  await page.goto(`${baseURL}${route}`, { waitUntil: 'networkidle', timeout: 60_000 });
  // Give lazy images below the fold a chance to stay lazy — we want what the
  // phone loads for the initial view, not the whole page scrolled.
  await page.waitForTimeout(500);

  const byType = {};
  let total = 0;
  for (const { type, bytes } of seen.values()) {
    byType[type] = (byType[type] || 0) + bytes;
    total += bytes;
  }

  const imageDetail = [...seen.values()]
    .filter((entry) => entry.type === 'image')
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5)
    .map((entry) => `      ${(entry.bytes / 1024).toFixed(0).padStart(5)} KB  ${entry.url.replace(baseURL, '')}`);

  totals.push({ route, total, byType, imageDetail });
  await page.close();
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

console.log(`\nViewport: iPhone 13 (390x844)  •  ${baseURL}\n`);
for (const { route, total, byType, imageDetail } of totals) {
  console.log(`${route}`);
  console.log(`  total      ${kb(total)}`);
  for (const [type, bytes] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(10)} ${kb(bytes)}`);
  }
  if (imageDetail.length) {
    console.log('    largest images:');
    console.log(imageDetail.join('\n'));
  }
  console.log();
}
console.log(`ALL ROUTES IMAGES: ${kb(totals.reduce((sum, t) => sum + (t.byType.image || 0), 0))}`);
console.log(`ALL ROUTES TOTAL:  ${kb(totals.reduce((sum, t) => sum + t.total, 0))}\n`);

await browser.close();
