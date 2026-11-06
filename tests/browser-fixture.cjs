const crypto = require('node:crypto');
const fs = require('node:fs/promises');
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
      const relative = pathname === '/' ? '/index.html' : pathname;
      if (/^\/assets\/[a-f0-9]+\.[a-z0-9]+$/i.test(relative)) {
        return route.fulfill({ status: 200, body: previewFixture, contentType: 'image/svg+xml' });
      }
      if (relative === '/data.json') {
        return route.fulfill({ status: 200, body: await snapshotBody(), contentType: mimeTypes['.json'] });
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

function launchBrowser() {
  return chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
}

async function evidencePath(name) {
  const dir = path.join(process.env.TMPDIR || require('node:os').tmpdir(), 'hugging-app-evidence');
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, name);
}

const fitsViewport = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

module.exports = { catalogBase, launchBrowser, evidencePath, fitsViewport, fixtureSnapshot };
