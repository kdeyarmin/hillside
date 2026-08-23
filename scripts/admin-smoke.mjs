/**
 * Drives the owner's dashboard the way Tammy does, against a running site.
 *
 * The unit tests cover the pure functions and the responsive audit covers the
 * public pages, but between them sat the whole admin surface: issuing a gift
 * card, writing a promo code, building a set, editing a category's copy,
 * receiving stock, saving a product. Those are server actions behind forms, so
 * nothing short of submitting the forms exercises them — and a form that posts
 * a field the action does not read fails silently, by writing nothing at all.
 *
 * Run against a site started with ADMIN_PASSWORD and ADMIN_SESSION_SECRET set:
 *
 *   DATABASE_URL=... ADMIN_PASSWORD=... ADMIN_SESSION_SECRET=... \
 *     node scripts/admin-smoke.mjs
 *
 * Playwright is not a declared dependency — same as `scripts/responsive-audit.mjs`,
 * which the audit workflow installs on demand rather than carrying in the
 * lockfile for everyone who only wants to build the site:
 *
 *   npm install --no-save --package-lock=false playwright@1.55.0
 *   npx playwright install --with-deps chromium
 *
 * Exits non-zero on the first failed expectation, listing every failure.
 */
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const PW = process.env.ADMIN_PASSWORD;

/**
 * This script writes: it issues cards, mints codes, builds a set and books
 * stock in. Everything it makes is removed again at the end, but a crash
 * midway leaves some of it behind, and booking stock in is not something to
 * do to a real shelf by accident. So it refuses to run anywhere but a local
 * database unless it is told, in as many words, that this one is disposable.
 */
const DISPOSABLE = 'yes-this-database-is-disposable';
const dbUrl = process.env.DATABASE_URL || '';
const localish = (value) => /^(https?:\/\/)?(127\.0\.0\.1|localhost|\[::1\])([:/]|$)/.test(value);
if (process.env.ADMIN_SMOKE_ALLOW_REMOTE !== DISPOSABLE) {
  /**
   * Both halves of "where does this write land" have to be checked, not one.
   *
   * The forms this drives write through the *site*, while the assertions and
   * the cleanup run against the *database* — and the two are configured
   * separately. Checking only the database would let a local DATABASE_URL wave
   * through a remote SMOKE_BASE_URL, so every form submission would edit that
   * site's categories, products and stock while cleanup tidied an unrelated
   * local database and reported success.
   */
  const dbLocal = /@(127\.0\.0\.1|localhost)[:/]/.test(dbUrl);
  if (!dbLocal || !localish(BASE)) {
    console.error('Refusing to run: this must point at a local database AND a local site.');
    console.error(`  DATABASE_URL   local: ${dbLocal}`);
    console.error(`  SMOKE_BASE_URL local: ${localish(BASE)}  (${BASE})`);
    console.error(`Set ADMIN_SMOKE_ALLOW_REMOTE=${DISPOSABLE} to override.`);
    process.exit(2);
  }
}
if (!PW) {
  console.error('Refusing to run: ADMIN_PASSWORD is not set, so there is no way to sign in.');
  process.exit(2);
}

const db = new PrismaClient();
const results = [];
/** What to undo, newest first, however the run ends. */
const undo = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error.message)));

async function open(path) {
  pageErrors.length = 0;
  const response = await page.goto(BASE + path, { waitUntil: 'networkidle' });
  // Most editors sit inside collapsed <details>, and a field inside a closed
  // one cannot be filled by a real click either.
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  await page.waitForTimeout(250);
  return response;
}

try {
  // ---------------------------------------------------------------- sign in
  await open('/admin');
  {
    const form = page.locator('form:has(input[name="password"])');
    await form.locator('input[name="email"]').fill('owner@example.com');
    await form.locator('input[name="password"]').fill(PW);
    await form.locator('button').first().click();
    await page.waitForTimeout(1800);
    const signedIn = (await ctx.cookies()).some((c) => c.name === 'hillside-admin');
    /**
     * The login allows eight attempts per quarter hour, so running this script
     * repeatedly is itself enough to be locked out. Worth saying plainly:
     * "throttled" and "wrong password" look identical from here otherwise.
     */
    const throttled = page.url().includes('error=throttled');
    check('sign in', signedIn, throttled ? 'THROTTLED - the login allows 8 attempts per 15 minutes; wait or restart the server' : '');
    if (!signedIn) throw new Error(throttled ? 'locked out by the login throttle' : 'sign in rejected');
  }

  // ------------------------------------------------------------- gift cards
  await open('/admin/discounts');
  {
    const before = await db.giftCard.count();
    /**
     * Noted so the card this run issues can be picked out by id afterwards.
     * Taking the newest card in the table instead would delete somebody else's
     * if anything issued one while this was running.
     */
    const preexisting = new Set(
      (await db.giftCard.findMany({ select: { id: true } })).map((c) => c.id)
    );
    const form = page.locator('form:has(input[name="recipientName"])');
    await form.locator('input[name="amount"]').fill('25');
    await form.locator('input[name="recipientName"]').fill('Smoke Test');
    await form.locator('input[name="recipientEmail"]').fill('smoke@example.invalid');
    const send = form.locator('input[name="sendEmail"]');
    if (await send.count()) await send.uncheck().catch(() => {});
    await form.locator('button:has-text("Issue")').first().click();
    await page.waitForTimeout(2500);

    const card = await db.giftCard.findFirst({
      where: { id: { notIn: [...preexisting] } },
      orderBy: { createdAt: 'desc' }
    });
    if (card) undo.push(async () => {
      await db.giftCardEntry.deleteMany({ where: { giftCardId: card.id } });
      await db.giftCard.delete({ where: { id: card.id } });
    });
    check('gift card: row created', (await db.giftCard.count()) === before + 1);
    check('gift card: balance is $25.00', card?.balanceCents === 2500, `balanceCents=${card?.balanceCents}`);
    check('gift card: code printed in groups of four', /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(card?.code || ''), `code=${card?.code}`);
    const entry = card && (await db.giftCardEntry.findFirst({ where: { giftCardId: card.id, kind: 'ISSUE' } }));
    check('gift card: ISSUE ledger entry written', Boolean(entry), `amountCents=${entry?.amountCents}`);
  }

  // ------------------------------------------------------------ promo codes
  {
    const code = 'SMOKE' + String(Date.now()).slice(-6);
    // Targeted by its submit button: every existing promo row also renders an
    // edit form carrying a `code` field, so `.first()` would be a lottery.
    const form = page.locator('form:has(button:has-text("Create code"))').first();
    await form.locator('input[name="code"]').fill(code);
    await form.locator('select[name="kind"]').selectOption('PERCENT');
    await form.locator('input[name="percentOff"]').fill('20');
    await form.locator('input[name="minSubtotal"]').fill('10');
    await form.locator('button:has-text("Create code")').first().click();
    await page.waitForTimeout(2500);

    const promo = await db.promotion.findFirst({ where: { code } });
    if (promo) undo.push(async () => {
      await db.promotionRedemption.deleteMany({ where: { promotionId: promo.id } });
      await db.promotion.delete({ where: { id: promo.id } });
    });
    check('promo code: row created', Boolean(promo), `code=${code}`);
    check('promo code: percentage stored', promo?.percentOff === 20, `percentOff=${promo?.percentOff}`);
    check('promo code: minimum stored in cents', promo?.minSubtotalCents === 1000, `minSubtotalCents=${promo?.minSubtotalCents}`);
  }

  // ------------------------------------------------- category editorial copy
  await open('/admin/content');
  {
    const marker = 'Smoke-tested intro ' + Date.now();
    const form = page.locator('form:has(textarea[name="intro"])').first();
    const slug = await form.locator('input[name="slug"]').inputValue();

    /**
     * This page lists categories and collections side by side and both carry
     * these fields, so which table the form belongs to has to be settled
     * before anything is written. Reading one and restoring the other would
     * leave the copy overwritten for good — in the half of the script whose
     * whole job is to put things back.
     */
    const owner = (await db.category.findFirst({ where: { slug } })) ? db.category
      : (await db.collection.findFirst({ where: { slug } })) ? db.collection
      : null;
    if (!owner) {
      check('category: the first editor on the page maps to a row', false, `no category or collection with slug=${slug}`);
    } else {
      const previous = await owner.findFirst({ where: { slug } });
      undo.push(() => owner.update({
        where: { id: previous.id },
        data: { intro: previous.intro, metaTitle: previous.metaTitle }
      }));

      await form.locator('textarea[name="intro"]').fill(marker);
      await form.locator('input[name="metaTitle"]').fill('Smoke meta title');
      await form.locator('button[type="submit"], button:not([type])').last().click();
      await page.waitForTimeout(2500);

      const after = await owner.findFirst({ where: { slug } });
      check('category: intro saved', after?.intro === marker, `slug=${slug}`);
      check('category: meta title saved', after?.metaTitle === 'Smoke meta title');
    }
  }

  // -------------------------------------------------------- receiving stock
  await open('/admin');
  {
    const form = page.locator('form.restock-form').first();
    if (!(await form.count())) {
      check('restock: form present on the Today board', false, 'nothing needs restocking, so nothing rendered');
    } else {
      /**
       * Booking stock in is the one step here that moves a number the shop
       * actually trades on, so it is captured per product and put back
       * afterwards. A total alone would not be enough to reverse it — that
       * says five arrived somewhere, not which shelf they went on.
       *
       * And `inventory` alone is not enough either: receiving stock also
       * stamps `lastRestockedAt`, can move `inventoryStatus` off ON_ORDER, and
       * on a size-tracked product increments the chosen entry inside `sizes`.
       * Restoring only the total would leave the metadata behind and, on a
       * sized product, a per-size count five higher than the total it belongs
       * to — a corruption worse than the change it was undoing.
       */
      const columns = {
        select: {
          id: true, inventory: true, sizes: true,
          lastRestockedAt: true, inventoryStatus: true
        }
      };
      const before = await db.product.findMany(columns);
      await form.locator('input[name="quantity"]').fill('5');
      await form.locator('button').first().click();
      await page.waitForTimeout(2500);
      const after = await db.product.findMany(columns);

      const priorById = new Map(before.map((p) => [p.id, p]));
      const differs = (a, b) =>
        a.inventory !== b.inventory ||
        a.lastRestockedAt?.getTime() !== b.lastRestockedAt?.getTime() ||
        a.inventoryStatus !== b.inventoryStatus ||
        JSON.stringify(a.sizes) !== JSON.stringify(b.sizes);
      const moved = after.filter((row) => differs(priorById.get(row.id), row));
      undo.push(async () => {
        for (const row of moved) {
          const prior = priorById.get(row.id);
          await db.product.update({
            where: { id: row.id },
            data: {
              inventory: prior.inventory,
              sizes: prior.sizes ?? undefined,
              lastRestockedAt: prior.lastRestockedAt,
              inventoryStatus: prior.inventoryStatus
            }
          });
        }
      });

      const total = (rows) => rows.reduce((sum, p) => sum + p.inventory, 0);
      const delta = total(after) - total(before);
      check('restock: booking 5 in raises total stock by exactly 5', delta === 5, `delta=${delta}`);
      check('restock: it lands on exactly one product', moved.length === 1, `${moved.length} products changed`);
    }
  }

  // ------------------------------- the product form must not erase its owner's
  // work. Saving an untouched form is the exact action that used to wipe these
  // columns, so it is the action worth repeating.
  for (const [slug, tags, traits, giftTags] of [
    ['hillside-calm-tea', ['handmade', 'giftable'], ['tea', 'infuser', '-terrarium'], ['tea-lover']],
    // Tags are validated against the product's type on save, so the plant-only
    // vocabulary has to be proved on an actual plant.
    ['golden-pothos', ['pet-safe', 'low-light'], ['carnivorous', '-terrarium'], ['teacher', 'housewarming']]
  ]) {
    const product = await db.product.findFirst({ where: { slug } });
    if (!product) { check(`product form: ${slug} exists`, false); continue; }
    const original = { tags: product.tags, traits: product.traits, giftTags: product.giftTags };
    undo.push(() => db.product.update({ where: { id: product.id }, data: original }));
    await db.product.update({ where: { id: product.id }, data: { tags, traits, giftTags } });

    await open(`/admin/products/${product.id}`);
    const form = page.locator('form:has(input[name="inventory"])').first();
    if (!(await form.count())) { check(`product form: ${slug} editor renders`, false); continue; }
    check(`product form: ${slug} editor renders`, pageErrors.length === 0, pageErrors[0] || '');

    const before = await db.product.findUnique({ where: { id: product.id } });
    await form.locator('button:has-text("Save")').first().click();
    await page.waitForTimeout(2500);
    const after = await db.product.findUnique({ where: { id: product.id } });

    /**
     * First prove the save actually happened.
     *
     * Every check below asserts a field is *unchanged*, and a form whose
     * button is wired to nothing — or an action that quietly became a no-op —
     * leaves every field unchanged too. All four would pass while testing
     * nothing whatsoever. `updatedAt` moves on any write, so a stamp no newer
     * than before means nothing was written and the rest is meaningless.
     */
    check(`product form: ${slug} save actually wrote`,
      after.updatedAt.getTime() > before.updatedAt.getTime(),
      `updatedAt ${before.updatedAt.toISOString()} -> ${after.updatedAt.toISOString()}`);

    const same = (key) => JSON.stringify(after[key]) === JSON.stringify(before[key]);
    check(`product form: ${slug} keeps tags on an untouched save`, same('tags'), `${JSON.stringify(before.tags)} -> ${JSON.stringify(after.tags)}`);
    check(`product form: ${slug} keeps traits on an untouched save`, same('traits'), `${JSON.stringify(before.traits)} -> ${JSON.stringify(after.traits)}`);
    check(`product form: ${slug} keeps inventory`, after.inventory === before.inventory, `${before.inventory} -> ${after.inventory}`);
    check(`product form: ${slug} keeps sku`, after.sku === before.sku, `${before.sku} -> ${after.sku}`);
    /**
     * The gift guides were the case this list was missing. `saveProduct` read
     * `giftTags` from the form all along, but nothing rendered the boxes, so
     * every save posted an empty list and cleared the column — the owner's only
     * lever over the occasion guides could be wiped but never set, and no check
     * here noticed because none of them looked at it.
     *
     * Compared as a set rather than as a list, unlike the columns above. The
     * boxes post in the order the guides are defined in, so a save rewrites the
     * column in that order whatever order it was stored in, and every reader
     * asks whether a guide is *in* the list rather than where. Comparing
     * positions would fail this on a difference nothing can observe.
     */
    const sameSet = (key) =>
      JSON.stringify([...(after[key] ?? [])].sort()) === JSON.stringify([...(before[key] ?? [])].sort());
    check(`product form: ${slug} keeps gift guides on an untouched save`, sameSet('giftTags'), `${JSON.stringify(before.giftTags)} -> ${JSON.stringify(after.giftTags)}`);
  }

  // ---------------------------------------------------------- building a set
  await open('/admin/merchandising');
  buildSet: {
    const slug = 'smoke-set-' + String(Date.now()).slice(-6);
    const tea = await db.product.findFirst({ where: { slug: 'hillside-calm-tea' } });
    const infuser = await db.product.findFirst({ where: { slug: 'stainless-tea-infuser' } });
    /**
     * A catalog without these two is a reason to report a failing check, not
     * to throw: crashing here would skip every check after it and print no
     * summary, so a missing fixture would look like a broken script rather
     * than a missing fixture.
     */
    if (!tea || !infuser) {
      check('set: the two component products exist to build from', false,
        `hillside-calm-tea=${Boolean(tea)} stainless-tea-infuser=${Boolean(infuser)}`);
      break buildSet;
    }
    const form = page.locator('form:has(button:has-text("Create set"))').first();
    await form.locator('input[name="title"]').fill('Smoke Test Set');
    await form.locator('input[name="slug"]').fill(slug);
    await form.locator('input[name="price"]').fill('40');
    await form.locator('textarea[name="description"]').fill('Built by scripts/admin-smoke.mjs.');
    await form.locator('select[name="itemProductId-0"]').selectOption(tea.id);
    await form.locator('input[name="itemQuantity-0"]').fill('1');
    await form.locator('select[name="itemProductId-1"]').selectOption(infuser.id);
    await form.locator('input[name="itemQuantity-1"]').fill('2');
    await form.locator('button:has-text("Create set")').first().click();
    await page.waitForTimeout(3000);

    const bundle = await db.bundle.findFirst({ where: { slug }, include: { items: true } });
    if (bundle) undo.push(async () => {
      await db.bundleItem.deleteMany({ where: { bundleId: bundle.id } });
      await db.bundle.delete({ where: { id: bundle.id } });
    });
    check('set: row created', Boolean(bundle), `slug=${slug}`);
    check('set: price stored in cents', bundle?.priceCents === 4000, `priceCents=${bundle?.priceCents}`);
    check('set: both components linked', bundle?.items.length === 2, `items=${bundle?.items.length}`);
    check('set: component quantity stored', bundle?.items.find((i) => i.productId === infuser.id)?.quantity === 2);
    if (bundle) {
      const res = await page.goto(BASE + '/bundles/' + slug, { waitUntil: 'networkidle' });
      check('set: reachable on the public site', res?.status() === 200, `HTTP ${res?.status()}`);
    }
  }
} finally {
  // Undo newest first, so a row's dependents go before the row.
  /**
   * Cleanup failures are failures. A run that leaves an issued card, a set or
   * booked-in stock behind has not done what this script promises, and
   * reporting success because the functional checks passed would be the one
   * lie that matters most here.
   */
  for (const step of undo.reverse()) {
    try {
      await step();
    } catch (error) {
      check('cleanup: everything this run created was removed', false, error.message);
    }
  }
  await browser.close();
  await db.$disconnect();
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + '='.repeat(60));
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFAILURES:');
  failed.forEach((f) => console.log('  - ' + f.name + (f.detail ? '  ' + f.detail : '')));
}
process.exit(failed.length ? 1 : 0);
