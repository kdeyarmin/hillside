import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL = (process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const outputDir = path.resolve(process.env.AUDIT_OUTPUT_DIR || 'responsive-audit-output');

const profiles = [
  { name: 'phone-320', width: 320, height: 568, mobile: true, fullRoutes: true },
  { name: 'phone-390', width: 390, height: 844, mobile: true, fullRoutes: true },
  { name: 'phone-430', width: 430, height: 932, mobile: true, fullRoutes: false },
  { name: 'tablet-768', width: 768, height: 1024, mobile: true, fullRoutes: true },
  { name: 'laptop-1280', width: 1280, height: 800, mobile: false, fullRoutes: true },
  { name: 'desktop-1600', width: 1600, height: 1000, mobile: false, fullRoutes: true },
  { name: 'desktop-1920', width: 1920, height: 1080, mobile: false, fullRoutes: false }
];

const routes = [
  { name: 'home', path: '/' },
  { name: 'shop', path: '/shop' },
  { name: 'product', path: '/shop/monstera-deliciosa' },
  { name: 'classes', path: '/classes' },
  { name: 'care', path: '/care' },
  { name: 'care-guide', path: '/care/monstera-deliciosa' },
  { name: 'about', path: '/about' },
  { name: 'contact', path: '/contact' },
  { name: 'gallery', path: '/gallery' },
  { name: 'shipping', path: '/shipping-returns' },
  { name: 'faq', path: '/faq' },
  { name: 'cart', path: '/cart' },
  { name: 'order-status', path: '/order-status' },
  { name: 'admin-sign-in', path: '/admin' }
];

const reducedRoutes = new Set(['home', 'shop', 'product', 'classes', 'care', 'contact', 'cart']);
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

async function settlePage(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });

  await page.evaluate(async () => {
    const documentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const step = Math.max(500, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < documentHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 55));
    }
    window.scrollTo(0, 0);
  });

  await page.waitForTimeout(350);
  await page.evaluate(async () => {
    const visibleImages = Array.from(document.images).filter((image) => {
      const rect = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });

    await Promise.all(
      visibleImages.map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise((resolve) => {
          const finish = () => resolve(undefined);
          image.addEventListener('load', finish, { once: true });
          image.addEventListener('error', finish, { once: true });
          setTimeout(finish, 4500);
        });
      })
    );
  });
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
    const desktopNavOverflow = desktopNav
      ? desktopNav.scrollWidth > desktopNav.clientWidth + 2
      : false;

    return {
      title: document.title,
      lang: document.documentElement.lang,
      mainCount: document.querySelectorAll('main').length,
      h1Count: document.querySelectorAll('h1').length,
      viewportWidth,
      scrollWidth: Math.max(document.body.scrollWidth, root.scrollWidth),
      horizontalOverflow: Math.max(document.body.scrollWidth, root.scrollWidth) > viewportWidth + 2,
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
    const menuButton = page.getByRole('button', { name: 'Open navigation menu' });
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

    const cartButton = page.getByRole('button', { name: /Open cart with/ }).first();
    if (!(await cartButton.isVisible())) {
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

    const mobileButton = page.getByRole('button', { name: 'Open navigation menu' });
    if ((await mobileButton.count()) && (await mobileButton.isVisible())) {
      recordFailure(profile, route, 'Mobile menu button is visible at a desktop viewport');
    }
  }
}

const browser = await chromium.launch({ headless: true });

try {
  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.mobile ? 2 : 1,
      isMobile: profile.mobile,
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
        const type = request.resourceType();
        failedRequests.push({
          url: request.url(),
          type,
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
