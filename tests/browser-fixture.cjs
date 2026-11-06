const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const siteRoot = path.resolve(__dirname, '../site');
const localOrigin = 'http://hugging-app.test';
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const previewFixture = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="640"><rect width="320" height="640" fill="#7371d9"/></svg>'
);

const FIXTURE_CATEGORIES = ['Education', 'Productivity', 'Social Networking'];
const FIXTURE_APPS_PER_CATEGORY = 20;
const FIXTURE_SCREENSHOTS_PER_APP = 3;

const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function fixtureSnapshot() {
  const apps = [],
    screens = [];
  FIXTURE_CATEGORIES.forEach((category, c) => {
    for (let rank = 1; rank <= FIXTURE_APPS_PER_CATEGORY; rank++) {
      const n = c * FIXTURE_APPS_PER_CATEGORY + rank;
      const name = `Fixture App ${String(n).padStart(2, '0')}`;
      const id = String(9000000 + n);
      const url = `https://apps.apple.com/us/app/fixture-app-${n}/id${id}`;
      const assetIds = [];
      for (let s = 0; s < FIXTURE_SCREENSHOTS_PER_APP; s++) {
        const screenId = hash(`${name} screenshot ${s}`);
        assetIds.push(screenId);
        screens.push({
          category,
          id: screenId,
          kind: 'image',
          path: `assets/${screenId}.png`,
          sourceUrl: url,
          title: name,
          fullSizeUrl: `https://is1-ssl.mzstatic.com/image/thumb/Fixture/${screenId}.png/1290x2796bb.png`,
        });
      }
      apps.push({
        id,
        name,
        category,
        categories: [category],
        chartRank: rank,
        chartRanks: { [category]: rank },
        assetIds,
        iconPath: `assets/${hash(`${name} icon`)}.png`,
        url,
        rating: 4.5,
      });
    }
  });
  return {
    apps,
    screens,
    flows: [],
    elements: [],
    coverage: {
      apps: apps.length,
      screens: screens.length,
      generatedAt: '2026-11-01T06:17:00Z',
      rankBasis: 'original-category-feed',
    },
  };
}

const appScreenshot = (n, s) => hash(`Fixture App ${String(n).padStart(2, '0')} screenshot ${s}`);
const appUrl = n => `https://apps.apple.com/us/app/fixture-app-${n}/id${9000000 + n}`;

// Three collections and four UI elements; two pinned screenshots exist only in the reviewed library.
function fixtureReviewedLibrary() {
  const pinned = [1, 2].map(n => {
    const id = hash(`Reviewed pinned screenshot ${n}`);
    return {
      id,
      path: `assets/${id}.png`,
      kind: 'image',
      category: 'Education',
      title: 'Fixture App 01',
      sourceUrl: appUrl(1),
      reviewedAt: '2026-10-01',
      curatedOnly: true,
    };
  });
  const reviewed = (category, appName, n) => ({ category, appName, sourceUrl: appUrl(n), reviewedAt: '2026-10-01' });
  return {
    schemaVersion: 1,
    screens: pinned,
    flows: [
      {
        id: 'community',
        title: 'Community and discovery',
        description: 'Feed, profile and search screenshots.',
        assetIds: [appScreenshot(41, 0), appScreenshot(41, 1), appScreenshot(41, 2)],
        tags: ['feed'],
        ...reviewed('Social Networking', 'Fixture App 41', 41),
      },
      {
        id: 'welcome',
        title: 'Onboarding welcome',
        description: 'Welcome screenshots with pinned reviewed images.',
        assetIds: [appScreenshot(1, 0), pinned[0].id, pinned[1].id],
        tags: ['onboarding'],
        ...reviewed('Education', 'Fixture App 01', 1),
      },
      {
        id: 'planner',
        title: 'Study planner',
        description: 'Planner overview and detail.',
        assetIds: [appScreenshot(21, 0), appScreenshot(21, 1)],
        tags: ['planning'],
        ...reviewed('Productivity', 'Fixture App 21', 21),
      },
    ],
    elements: [
      {
        id: 'tab-bar',
        title: 'Tab bar',
        description: 'Bottom navigation with four tabs.',
        screenId: appScreenshot(1, 1),
        tags: ['navigation'],
        ...reviewed('Education', 'Fixture App 01', 1),
      },
      {
        id: 'search-field',
        title: 'Search field',
        description: 'Search with recent queries.',
        screenId: appScreenshot(2, 0),
        tags: ['search'],
        ...reviewed('Education', 'Fixture App 02', 2),
      },
      {
        id: 'progress-ring',
        title: 'Progress ring',
        description: 'Daily goal progress.',
        screenId: pinned[0].id,
        tags: ['progress'],
        ...reviewed('Education', 'Fixture App 01', 1),
      },
      {
        id: 'empty-state',
        title: 'Empty state',
        description: 'Empty planner with a first action.',
        screenId: appScreenshot(21, 2),
        tags: ['empty'],
        ...reviewed('Productivity', 'Fixture App 21', 21),
      },
    ],
  };
}

async function reviewedLibraryBody() {
  if (process.env.CATALOG_SNAPSHOT === 'live') return fs.readFile(path.join(siteRoot, 'curation.json'));
  return Buffer.from(JSON.stringify(fixtureReviewedLibrary()));
}

async function snapshotBody() {
  const source = process.env.CATALOG_SNAPSHOT;
  if (source === 'live') return fs.readFile(path.join(siteRoot, 'data.json'));
  if (source) return fs.readFile(source);
  return Buffer.from(JSON.stringify(fixtureSnapshot()));
}

async function catalogBase(page) {
  const configured = process.env.CATALOG_TEST_URL;
  if (configured) return configured.endsWith('/') ? configured : `${configured}/`;

  await page.route(`${localOrigin}/**`, async route => {
    try {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
      if (/^\/assets\/[a-f0-9]+\.[a-z0-9]+$/i.test(relative)) {
        return route.fulfill({ status: 200, body: previewFixture, contentType: 'image/svg+xml' });
      }
      if (relative === '/data.json') {
        return route.fulfill({ status: 200, body: await snapshotBody(), contentType: mimeTypes['.json'] });
      }
      if (relative === '/curation.json') {
        return route.fulfill({ status: 200, body: await reviewedLibraryBody(), contentType: mimeTypes['.json'] });
      }
      const file = path.resolve(siteRoot, `.${relative}`);
      if (file !== siteRoot && !file.startsWith(`${siteRoot}${path.sep}`)) {
        return route.fulfill({ status: 403, body: 'Blocked path' });
      }
      const body = await fs.readFile(file);
      return route.fulfill({
        status: 200,
        body,
        contentType: mimeTypes[path.extname(file)] || 'application/octet-stream',
      });
    } catch {
      return route.fulfill({ status: 404, body: 'Not found' });
    }
  });
  return `${localOrigin}/`;
}

const browserLibs = path.resolve(__dirname, '../.cache/browser-libs/root');

function launchBrowser() {
  const options = { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' };
  if (!fsSync.existsSync(browserLibs)) return chromium.launch(options);
  const libraryPath = ['usr/lib/x86_64-linux-gnu', 'lib/x86_64-linux-gnu'].map(dir => path.join(browserLibs, dir));
  const inherited = process.env.LD_LIBRARY_PATH ? [process.env.LD_LIBRARY_PATH] : [];
  return chromium.launch({
    ...options,
    env: { ...process.env, LD_LIBRARY_PATH: [...libraryPath, ...inherited].join(':') },
  });
}

async function evidencePath(name) {
  const dir = path.join(process.env.TMPDIR || require('node:os').tmpdir(), 'hugging-app-evidence');
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, name);
}

const fitsViewport = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

module.exports = { catalogBase, launchBrowser, evidencePath, fitsViewport, fixtureSnapshot, fixtureReviewedLibrary };
