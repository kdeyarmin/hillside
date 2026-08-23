import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL = (process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const outputDir = path.resolve(process.env.AUDIT_OUTPUT_DIR || 'responsive-audit-output');

/**
 * `laptop-960` is not a spare wide profile. The desktop header, the two-column
 * `.split` panels and the newsletter row all switch on at 901px, and the next
 * profile after 768 used to be 1280 — so the band where those layouts are at
 * their tightest was the one band never measured. Two breaks lived there: the
 * homepage story panel took 747px of a 924px container and painted its heading
 * off the side of the page, and the newsletter's "Join the list" button was an
 * 88px block with its label wrapped onto three lines.
 */
const profiles = [
  { name: 'phone-320', width: 320, height: 568, mobile: true, fullRoutes: true },
  { name: 'phone-390', width: 390, height: 844, mobile: true, fullRoutes: true },
  { name: 'phone-430', width: 430, height: 932, mobile: true, fullRoutes: false },
  { name: 'tablet-768', width: 768, height: 1024, mobile: true, fullRoutes: true },
  { name: 'laptop-960', width: 960, height: 900, mobile: false, fullRoutes: true },
  /* Short, not narrow. Every other desktop profile is tall enough that a pinned
     column fits it whatever it holds, so nothing measured what happens when one
     does not: a 13-inch laptop with a tab strip and a bookmarks bar leaves about
     640px, which is less than the product gallery's 648px. */
  { name: 'laptop-1280-short', width: 1280, height: 640, mobile: false, fullRoutes: false },
  { name: 'laptop-1280', width: 1280, height: 800, mobile: false, fullRoutes: true },
  { name: 'desktop-1600', width: 1600, height: 1000, mobile: false, fullRoutes: true },
  { name: 'desktop-1920', width: 1920, height: 1080, mobile: false, fullRoutes: false }
];

const routes = [
  { name: 'home', path: '/' },
  { name: 'shop', path: '/shop' },
  /* The shop narrowed to one category: the chip row is at its longest here, and
     it is the layout every header link and every homepage tile leads to. */
  { name: 'shop-category', path: '/shop?category=houseplants' },
  { name: 'product', path: '/shop/monstera-deliciosa' },
  /* A product sold in four pots, with a specification table under it. The pinned
     column carries the variant dropdown and its detail line, and the table below
     is the widest two-column block on the storefront. */
  { name: 'product-variants', path: '/shop/golden-pothos' },
  { name: 'collections', path: '/collections' },
  { name: 'collection', path: '/collections/tammys-favorites' },
  // '/classes' is hidden from the storefront (lib/class-visibility.ts) and
  // answers 404; restore this line with the flag.
  { name: 'care', path: '/care' },
  { name: 'care-guide', path: '/care/monstera-deliciosa' },
  { name: 'about', path: '/about' },
  { name: 'contact', path: '/contact' },
  { name: 'gallery', path: '/gallery' },
  { name: 'picks', path: '/amazon' },
  /* A search term is the one piece of arbitrary text the storefront prints into
     a heading, so it is the page most likely to be widened by its own content. */
  { name: 'search', path: '/search?q=monstera' },
  /* And a term with no space in it is the case the heading wrapping rule exists
     for. `q=monstera` renders a heading that wraps on its own and would pass
     with the rule deleted; 43 unbroken letters gave a 390px phone 2043px of
     horizontal scroll before it. */
  { name: 'search-long-term', path: `/search?q=${'monsteradeliciosavariegataborsigiana'}` },
  { name: 'shipping', path: '/shipping-returns' },
  { name: 'faq', path: '/faq' },
  { name: 'cart', path: '/cart' },
  { name: 'order-status', path: '/order-status' },
  { name: 'privacy', path: '/privacy' },
  { name: 'terms', path: '/terms' },
  { name: 'admin-sign-in', path: '/admin' }
];

const reducedRoutes = new Set([
  'home',
  'shop',
  'shop-category',
  'product',
  'product-variants',
  'classes',
  'care',
  'contact',
  'cart',
  'search-long-term'
]);
const failures = [];
const warnings = [];
const results = [];

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

function recordFailure(profile, route, message, details) {
  failures.push({ profile: profile.name, route: route.path, message, details });
}

function recordWarning(profile, route, message, details) {
  warnings.push({ profile: profile.name, route: route.path, message, details });
}

function safeName(value) {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

function expectedAbort(request) {
  const error = request.failure()?.errorText || '';
  const url = request.url();
  return error.includes('ERR_ABORTED') && (url.includes('_rsc=') || request.resourceType() === 'fetch');
}

async function settlePage(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });

  await page.evaluate(async () => {
    const documentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const step = Math.max(500, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < documentHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 45));
    }
    window.scrollTo(0, 0);
  });

  await page.waitForTimeout(250);
  await page.evaluate(async () => {
    const images = Array.from(document.images).filter((image) => {
      const rect = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });

    await Promise.all(
      images.map((image) => {
        if (image.complete && image.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
          const finish = () => resolve(undefined);
          image.addEventListener('load', finish, { once: true });
          image.addEventListener('error', finish, { once: true });
          setTimeout(finish, 4500);
        });
      })
    );
  });

  /* Give React image fallback state updates one paint cycle to settle. */
  await page.waitForTimeout(250);
}

async function collectMetrics(page, mobile) {
  return page.evaluate(({ mobile }) => {
    const root = document.documentElement;
    const viewportWidth = root.clientWidth;
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || '1') > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const clippedByAncestor = (element) => {
      const rect = element.getBoundingClientRect();
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent);
        if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) {
          const parentRect = parent.getBoundingClientRect();
          if (rect.left < parentRect.left - 2 || rect.right > parentRect.right + 2) return true;
        }
        parent = parent.parentElement;
      }
      return false;
    };

    const brokenImages = Array.from(document.images)
      .filter((image) => isVisible(image) && image.complete && image.naturalWidth === 0)
      .map((image) => ({
        src: image.currentSrc || image.src,
        alt: image.alt,
        className: image.className
      }));

    const overflowElements = Array.from(document.body.querySelectorAll('*'))
      .filter((element) => {
        if (!(element instanceof HTMLElement) || !isVisible(element)) return false;
        if (element.classList.contains('brand-mockup-background')) return false;
        const rect = element.getBoundingClientRect();
        if (rect.left >= -2 && rect.right <= viewportWidth + 2) return false;
        return !clippedByAncestor(element);
      })
      .slice(0, 12)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${
            element.className && typeof element.className === 'string'
              ? `.${element.className.trim().replace(/\s+/g, '.')}`
              : ''
          }`,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width)
        };
      });

    const controls = mobile
      ? Array.from(
          document.querySelectorAll(
            'button, input:not([type="hidden"]), select, textarea, summary, [role="button"], a.btn'
          )
        )
          .filter((element) => element instanceof HTMLElement && isVisible(element) && !element.classList.contains('honeypot'))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              element: `${element.tagName.toLowerCase()}${
                element.className && typeof element.className === 'string'
                  ? `.${element.className.trim().replace(/\s+/g, '.')}`
                  : ''
              }`,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              label:
                element.getAttribute('aria-label') ||
                element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) ||
                element.getAttribute('placeholder') ||
                ''
            };
          })
      : [];

    const smallTouchTargets = controls.filter((control) => control.width < 44 || control.height < 44);
    const severeTouchTargets = controls.filter((control) => control.width < 32 || control.height < 32);

    const undersizedInputs = mobile
      ? Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'))
          .filter((element) => element instanceof HTMLElement && isVisible(element) && !element.classList.contains('honeypot'))
          .map((element) => ({
            element: element.tagName.toLowerCase(),
            fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
            name: element.getAttribute('name') || element.getAttribute('aria-label') || ''
          }))
          .filter((entry) => entry.fontSize < 16)
      : [];

    const desktopNav = document.querySelector('.editorial-nav-inner');
    const desktopNavOverflow = desktopNav ? desktopNav.scrollWidth > desktopNav.clientWidth + 2 : false;
    const scrollWidth = Math.max(document.body.scrollWidth, root.scrollWidth);

    return {
      title: document.title,
      lang: document.documentElement.lang,
      mainCount: document.querySelectorAll('main').length,
      h1Count: document.querySelectorAll('h1').length,
      viewportWidth,
      scrollWidth,
      horizontalOverflow: scrollWidth > viewportWidth + 2,
      brokenImages,
      overflowElements,
      smallTouchTargets: smallTouchTargets.slice(0, 16),
      severeTouchTargets: severeTouchTargets.slice(0, 16),
      undersizedInputs,
      desktopNavOverflow
    };
  }, { mobile });
}

async function auditHeaderInteractions(page, profile, route) {
  if (route.path !== '/') return;

  if (profile.mobile) {
    const menuButton = page.locator('button.mobile-menu-button');
    if ((await menuButton.count()) !== 1 || !(await menuButton.isVisible())) {
      recordFailure(profile, route, 'Mobile navigation button is missing or hidden');
      return;
    }

    await menuButton.click();
    const menu = page.locator('#mobile-primary-menu');
    await menu.waitFor({ state: 'visible', timeout: 5000 });
    const menuBox = await menu.boundingBox();
    if (!menuBox || menuBox.x < -1 || menuBox.x + menuBox.width > profile.width + 1) {
      recordFailure(profile, route, 'Mobile navigation extends outside the viewport', menuBox);
    }
    const bodyLocked = await page.evaluate(() => document.body.classList.contains('is-scroll-locked'));
    if (!bodyLocked) recordFailure(profile, route, 'Page scroll was not locked while the mobile menu was open');

    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached', timeout: 5000 });

    const cartButton = page.locator('button.mobile-cart-button');
    if ((await cartButton.count()) !== 1 || !(await cartButton.isVisible())) {
      recordFailure(profile, route, 'Mobile cart button is missing or hidden');
      return;
    }

    await cartButton.click();
    const dialog = page.getByRole('dialog', { name: 'Shopping cart' });
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    const dialogBox = await dialog.boundingBox();
    if (!dialogBox || dialogBox.x < -1 || dialogBox.x + dialogBox.width > profile.width + 1) {
      recordFailure(profile, route, 'Cart drawer extends outside the mobile viewport', dialogBox);
    }

    await page.keyboard.press('Tab');
    const focusedInsideDialog = await page.evaluate(() => {
      const dialogElement = document.querySelector('[role="dialog"]');
      return Boolean(dialogElement && document.activeElement && dialogElement.contains(document.activeElement));
    });
    if (!focusedInsideDialog) recordFailure(profile, route, 'Keyboard focus escaped the open cart dialog');

    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached', timeout: 5000 });
  } else {
    const nav = page.locator('.editorial-nav-inner');
    if ((await nav.count()) !== 1 || !(await nav.isVisible())) {
      recordFailure(profile, route, 'Desktop navigation is missing or hidden');
    }

    const mobileButton = page.locator('button.mobile-menu-button');
    if ((await mobileButton.count()) && (await mobileButton.isVisible())) {
      recordFailure(profile, route, 'Mobile menu button is visible at a desktop viewport');
    }
  }
}

/**
 * The drawer is where most baskets are edited, and its item list is the first
 * thing a tall checkout panel starves: squeezed to a sliver, the items are still
 * in the cart but no Remove button can be reached. Only a real basket, driven
 * through the browser, shows that from the outside.
 */
async function auditCartDrawer(page, profile, route) {
  if (route.name !== 'shop') return;

  const addButtons = page.locator('.product-card button:not([disabled]):has-text("Add to cart")');
  if ((await addButtons.count()) < 2) {
    recordWarning(profile, route, 'Not enough in-stock products to audit the cart drawer');
    return;
  }

  const dialog = page.getByRole('dialog', { name: 'Shopping cart' });
  await addButtons.nth(0).click();
  await dialog.waitFor({ state: 'visible', timeout: 5000 });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
  await addButtons.nth(1).click();
  await dialog.waitFor({ state: 'visible', timeout: 5000 });

  const lines = page.locator('.cart-drawer .cart-line');
  if ((await lines.count()) !== 2) {
    recordFailure(profile, route, 'Cart drawer did not list both added items', await lines.count());
  }

  const basketHeight = await page
    .locator('.drawer-body')
    .evaluate((element) => Math.round(element.getBoundingClientRect().height))
    .catch(() => 0);
  if (basketHeight < 120) {
    recordFailure(profile, route, 'Cart drawer leaves too little room for the basket', {
      basketHeight
    });
  }

  /* Hit tested rather than merely measured: a control the checkout panel or the
     suggestions paint over is as unusable as one that is not rendered at all. */
  const reachable = (locator) =>
    locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return Boolean(hit && (hit === element || element.contains(hit)));
    });

  const checkoutButton = page.locator('.drawer-total button', { hasText: 'checkout' }).first();
  if (!(await checkoutButton.count())) {
    recordFailure(profile, route, 'Cart drawer has no checkout button');
  } else if (!(await reachable(checkoutButton))) {
    recordFailure(profile, route, 'Cart drawer checkout button is covered or off screen');
  }

  while ((await lines.count()) > 0) {
    const remaining = await lines.count();
    const name = await lines.first().locator('b').first().innerText();
    const removeButton = lines.first().locator('button', { hasText: 'Remove' });
    await removeButton.scrollIntoViewIfNeeded();
    if (!(await reachable(removeButton))) {
      recordFailure(profile, route, 'A cart line cannot be removed in the drawer', { item: name });
      break;
    }
    await removeButton.click();
    /* Waits on the line count rather than a fixed pause, which a loaded CI
       runner can outlast; a real failure still falls through to the check. */
    await page
      .waitForFunction(
        (expected) => document.querySelectorAll('.cart-drawer .cart-line').length === expected,
        remaining - 1,
        { timeout: 5000 }
      )
      .catch(() => undefined);
    if ((await lines.count()) !== remaining - 1) {
      recordFailure(profile, route, 'Removing a cart line left it in the drawer', { item: name });
      break;
    }
  }

  /* Later routes share this browser context, so the basket goes back to empty. */
  await page.evaluate(() => localStorage.removeItem('hillside-cart-v2'));
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
}

/**
 * The product photograph is pinned beside a much longer description, and a
 * pinned column taller than the window can never be scrolled to its end — it
 * re-pins on every frame, so whatever sits at its bottom is unreachable rather
 * than merely below the fold. On a multi-photograph product that bottom is the
 * thumbnail strip: the only control that reaches the other photographs.
 *
 * Measuring the height is not enough, because the failure is about reach. Each
 * thumbnail is hit tested at every scroll position where the column is actually
 * pinned, which is the only way to see a control that is painted but cannot be
 * clicked.
 */
async function auditStickyGallery(page, profile, route) {
  if (route.name !== 'product' || profile.width < 901) return;

  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  let pinnedSamples = 0;

  for (let offset = 0; offset < pageHeight; offset += 200) {
    await page.evaluate((y) => window.scrollTo(0, y), offset);
    await page.waitForTimeout(40);

    const sample = await page.evaluate(() => {
      const column = document.querySelector('.product-detail-image-wrap');
      if (!column) return null;

      const box = column.getBoundingClientRect();
      /* Only while it is genuinely stuck: in normal flow the rest of the page
         still scrolls it into view, so nothing is out of reach. */
      if (Math.abs(box.top - 24) > 1.5) return null;

      const unreachable = [...column.querySelectorAll('.product-gallery-thumbs button')]
        .map((thumb, index) => {
          const rect = thumb.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          );
          return hit && (hit === thumb || thumb.contains(hit))
            ? null
            : { thumbnail: index + 1, bottom: Math.round(rect.bottom) };
        })
        .filter(Boolean);

      return {
        overhang: Math.round(box.bottom - window.innerHeight),
        viewportHeight: window.innerHeight,
        columnHeight: Math.round(box.height),
        unreachable
      };
    });

    if (!sample) continue;
    pinnedSamples += 1;

    if (sample.overhang > 0) {
      recordFailure(profile, route, 'The pinned product photograph hangs below the window', sample);
      return;
    }
    if (sample.unreachable.length) {
      recordFailure(profile, route, 'A product thumbnail cannot be reached while the column is pinned', sample);
      return;
    }
  }

  if (!pinnedSamples) {
    recordWarning(profile, route, 'The product photograph never pinned, so its reach was not measured');
  }
}

const browser = await chromium.launch({
  headless: true,
  // Lets the audit run against a preinstalled browser instead of a downloaded one.
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
});

try {
  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      screen: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.mobile ? 2 : 1,
      /* Exact CSS viewport dimensions matter more than Chromium's device preset behavior. */
      isMobile: false,
      hasTouch: profile.mobile,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      locale: 'en-US'
    });

    for (const route of routes) {
      if (!profile.fullRoutes && !reducedRoutes.has(route.name)) continue;

      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      const pageErrors = [];
      const consoleErrors = [];
      const failedRequests = [];

      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('requestfailed', (request) => {
        if (expectedAbort(request)) return;
        failedRequests.push({
          url: request.url(),
          type: request.resourceType(),
          error: request.failure()?.errorText || 'request failed'
        });
      });

      let responseStatus = 0;
      try {
        const response = await page.goto(`${baseURL}${route.path}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        responseStatus = response?.status() || 0;
        if (!response || responseStatus >= 400) {
          recordFailure(profile, route, `Route returned HTTP ${responseStatus || 'no response'}`);
        }

        await settlePage(page);
        await auditHeaderInteractions(page, profile, route);
        await auditCartDrawer(page, profile, route);
        await auditStickyGallery(page, profile, route);
        const metrics = await collectMetrics(page, profile.mobile);

        if (!metrics.title.trim()) recordFailure(profile, route, 'Document title is empty');
        if (metrics.lang !== 'en') recordFailure(profile, route, 'The HTML language is not set to English', metrics.lang);
        if (metrics.mainCount !== 1) recordFailure(profile, route, 'Expected exactly one main landmark', metrics.mainCount);
        if (metrics.h1Count !== 1) recordFailure(profile, route, 'Expected exactly one H1 heading', metrics.h1Count);
        if (metrics.horizontalOverflow) {
          recordFailure(profile, route, 'Page has horizontal overflow', {
            viewportWidth: metrics.viewportWidth,
            scrollWidth: metrics.scrollWidth,
            elements: metrics.overflowElements
          });
        }
        if (metrics.brokenImages.length) {
          recordFailure(profile, route, 'Visible images failed to load', metrics.brokenImages);
        }
        if (metrics.desktopNavOverflow && !profile.mobile) {
          recordFailure(profile, route, 'Desktop navigation overflows its container');
        }
        if (metrics.undersizedInputs.length) {
          recordFailure(profile, route, 'Mobile form controls use text smaller than 16px', metrics.undersizedInputs);
        }
        if (metrics.severeTouchTargets.length) {
          recordFailure(profile, route, 'Interactive controls are severely undersized', metrics.severeTouchTargets);
        } else if (metrics.smallTouchTargets.length) {
          recordWarning(profile, route, 'Some interactive controls are smaller than 44px', metrics.smallTouchTargets);
        }
        if (pageErrors.length) recordFailure(profile, route, 'Uncaught browser errors occurred', pageErrors);

        const criticalRequestFailures = failedRequests.filter((request) =>
          ['document', 'script', 'stylesheet', 'xhr', 'fetch'].includes(request.type)
        );
        if (criticalRequestFailures.length) {
          recordFailure(profile, route, 'Critical network requests failed', criticalRequestFailures);
        }

        const shouldScreenshot =
          route.name === 'home' ||
          (route.name === 'shop' && ['phone-320', 'tablet-768', 'desktop-1600'].includes(profile.name));
        if (shouldScreenshot) {
          await page.screenshot({
            path: path.join(outputDir, `${safeName(profile.name)}-${safeName(route.name)}.png`),
            fullPage: true,
            animations: 'disabled'
          });
        }

        results.push({
          profile: profile.name,
          route: route.path,
          status: responseStatus,
          horizontalOverflow: metrics.horizontalOverflow,
          brokenImages: metrics.brokenImages.length,
          touchWarnings: metrics.smallTouchTargets.length,
          consoleErrors: consoleErrors.length,
          failedRequests: failedRequests.length
        });

        if (consoleErrors.length) {
          recordWarning(profile, route, 'Browser console reported errors', consoleErrors.slice(0, 8));
        }
        const imageRequestFailures = failedRequests.filter((request) => request.type === 'image');
        if (imageRequestFailures.length && !metrics.brokenImages.length) {
          recordWarning(
            profile,
            route,
            'Remote images failed but the local fallback rendered successfully',
            imageRequestFailures.slice(0, 8)
          );
        }
      } catch (error) {
        recordFailure(
          profile,
          route,
          'Audit could not complete the route',
          error instanceof Error ? error.message : String(error)
        );
      } finally {
        await page.close();
      }
    }

    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  baseURL,
  profiles,
  routes,
  summary: {
    pagesAudited: results.length,
    failures: failures.length,
    warnings: warnings.length
  },
  failures,
  warnings,
  results
};

await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));

const markdown = [
  '# Hillside responsive audit',
  '',
  `- Generated: ${report.generatedAt}`,
  `- Base URL: ${baseURL}`,
  `- Route/viewport combinations: ${results.length}`,
  `- Critical failures: ${failures.length}`,
  `- Warnings: ${warnings.length}`,
  '',
  '## Critical failures',
  '',
  failures.length
    ? failures.map((item) => `- **${item.profile} ${item.route}:** ${item.message}`).join('\n')
    : '- None',
  '',
  '## Warnings',
  '',
  warnings.length
    ? warnings.map((item) => `- **${item.profile} ${item.route}:** ${item.message}`).join('\n')
    : '- None',
  '',
  '## Coverage',
  '',
  '| Viewport | Route | HTTP | Overflow | Broken images | Touch warnings |',
  '|---|---|---:|---:|---:|---:|',
  ...results.map(
    (item) =>
      `| ${item.profile} | ${item.route} | ${item.status} | ${item.horizontalOverflow ? 'Yes' : 'No'} | ${
        item.brokenImages
      } | ${item.touchWarnings} |`
  )
].join('\n');

await fs.writeFile(path.join(outputDir, 'report.md'), markdown);
console.log(markdown);

if (failures.length) process.exitCode = 1;
