const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {
  catalogBase,
  launchBrowser,
  evidencePath,
  fitsViewport,
  fixtureSnapshot,
  fixtureReviewedLibrary,
} = require('./browser-fixture.cjs');

let browser;
before(async () => {
  browser = await launchBrowser();
});
after(() => browser?.close());

async function openCatalog(hash, options = { viewport: { width: 1440, height: 1000 } }) {
  const page = await browser.newPage(options);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const base = await catalogBase(page);
  if (hash !== null) await page.goto(base + hash);
  return { page, base, errors };
}

const readExport = async download => JSON.parse(await fs.readFile(await download.path(), 'utf8'));
const waitForSnapshot = page =>
  page.waitForFunction(() => document.querySelector('#coverage').textContent.includes('Snapshot'));

test('an app card opens its viewer from the keyboard', async () => {
  const { page, errors } = await openCatalog('#apps');
  await page.locator('.app-open').first().waitFor();
  assert.equal(await page.locator('.app-open').count(), 48);
  await page.locator('.app-open').first().press('Enter');
  assert.equal(await page.getByRole('dialog').isVisible(), true);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: await evidencePath('desktop.png') });
  assert.deepEqual(errors, []);
  await page.close();
});

test('comparison and board stay in sync, persist and export', async () => {
  const { page, errors } = await openCatalog('#screens');
  const save = page.locator('#content [data-save]');
  await save.first().waitFor();
  await save.first().click();
  await page.locator('#content [data-select]').nth(0).click();
  await page.locator('#content [data-select]').nth(1).click();
  await page.getByRole('button', { name: /^Compare \d+$/ }).click();
  assert.equal(await page.locator('.comparegrid .pin').count(), 2);
  await page.locator('#viewer [data-save]').first().click();
  assert.equal(await save.first().getAttribute('aria-pressed'), 'false');
  await page.keyboard.press('Escape');
  await save.first().click();
  await page.getByRole('link', { name: 'Saved board', exact: true }).click();
  await page.getByRole('heading', { name: 'Saved board', level: 1 }).waitFor();
  assert.equal(await page.locator('#content .pin').count(), 1);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export data' }).click(),
  ]);
  const exported = await readExport(download);
  assert.equal(exported.records.length, 1);
  assert.equal(exported.route, 'boards');
  await page.reload();
  await page.locator('#content .pin').waitFor();
  await page.locator('#content [data-save]').click();
  await page.getByText('Your board is empty.', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test('search and category filters narrow results and clear back to the first page', async () => {
  const { page, errors } = await openCatalog('#screens');
  await page.locator('#content .pin').first().waitFor();
  await page.getByRole('searchbox', { name: 'Search catalog' }).fill('zzzz-no-such-app-zzzz');
  await page.getByText('No matching results', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  assert.equal(await page.locator('#content .pin').count(), 48);
  const category = page.getByRole('combobox', { name: 'Category' });
  const firstCategory = await category.locator('option').nth(1).textContent();
  await category.selectOption(firstCategory);
  const labels = await page.locator('#content .pinmeta').allTextContents();
  assert(labels.length > 0);
  assert(labels.every(label => label === firstCategory));
  assert.deepEqual(errors, []);
  await page.close();
});

test('informational routes hide export and unknown routes fall back to Apps', async () => {
  const { page, base, errors } = await openCatalog(null);
  for (const route of ['flows', 'elements', 'agents', 'plugin', 'unknown']) {
    await page.goto(base + '#' + route);
    await waitForSnapshot(page);
    if (['agents', 'plugin'].includes(route))
      assert.equal(await page.getByRole('button', { name: 'Export data' }).isVisible(), false);
    if (route === 'unknown') assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'Apps');
  }
  assert.deepEqual(errors, []);
  await page.close();
});

test('every main route fits 390px and 320px without horizontal scroll', async () => {
  const { page, base, errors } = await openCatalog(null);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['apps', 'screens', 'elements', 'flows', 'boards', 'agents', 'plugin']) {
      await page.goto(base + '#' + route);
      await waitForSnapshot(page);
      if (['elements', 'flows'].includes(route)) await page.locator('.collection-card').first().waitFor();
      await page.screenshot({ path: await evidencePath(`${route}-${width}.png`), animations: 'disabled' });
      assert(await fitsViewport(page), `${route} overflows at ${width}px`);
    }
  }
  assert.deepEqual(errors, []);
  await page.close();
});

test('a failed snapshot load offers a retry and keeps export disabled', async () => {
  const { page, base } = await openCatalog(null);
  await page.route('**/data.json', route => route.fulfill({ status: 503 }));
  await page.goto(base);
  await page.getByRole('button', { name: 'Try again' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Export data' }).isEnabled(), false);
  await page.close();
});

test('denied storage keeps the board for the session and says so', async () => {
  const { page, base } = await openCatalog(null);
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('denied');
    };
  });
  await page.goto(base + '#screens');
  await page.locator('#content [data-save]').first().click();
  assert.match(await page.getByRole('status').first().textContent(), /Storage unavailable/);
  await page.close();
});

test('malformed snapshot records are skipped and the board survives', async () => {
  const { page, base, errors } = await openCatalog(null);
  const valid = fixtureSnapshot();
  const savedId = valid.screens[0].id;
  await page.addInitScript(id => localStorage.setItem('oac-board', JSON.stringify([id])), savedId);
  await page.route('**/data.json', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ...valid,
        apps: [
          { id: '1', name: 7, assetIds: {} },
          { id: '2', name: 'Broken lists', assetIds: 'x', categories: {}, chartRanks: [] },
          ...valid.apps,
        ],
        screens: [
          { id: 'not-a-hash', path: 'assets/x.png' },
          { ...valid.screens[1], path: [valid.screens[1].path] },
          ...valid.screens,
        ],
      }),
    })
  );
  await page.goto(base + '#apps');
  await page.locator('.app-open').first().waitFor();
  await page
    .locator('#coverage')
    .filter({ hasText: /^61 apps · 182 screenshots/ })
    .waitFor();
  await page.getByRole('searchbox', { name: 'Search catalog' }).fill('Broken lists');
  await page.getByRole('button', { name: 'Open Broken lists', exact: true }).click();
  await page.getByText('No screenshots available yet.').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Saved board', exact: true }).click();
  await page.getByRole('heading', { name: 'Saved board', level: 1 }).waitFor();
  assert.equal(await page.locator('#content .pin').count(), 1);
  assert.deepEqual(errors, []);
  await page.close();
});

test('a snapshot that is not a catalog shows a retry and keeps the board', async () => {
  const { page, base, errors } = await openCatalog(null);
  await page.addInitScript(() => localStorage.setItem('oac-board', JSON.stringify(['kept'])));
  await page.route('**/data.json', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.goto(base);
  await page.getByRole('button', { name: 'Try again' }).waitFor();
  assert.match(await page.locator('#content').textContent(), /Your board remains on this device/);
  assert.equal(await page.evaluate(() => localStorage.getItem('oac-board')), '["kept"]');
  assert.deepEqual(errors, []);
  await page.close();
});

test('a reference page offers a keyboard skip link to its main content', async () => {
  const { page, base, errors } = await openCatalog(null);
  await page.goto(base + 'apps/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  assert.equal(await skip.evaluate(link => link === document.activeElement), true);
  assert(await skip.evaluate(link => link.getBoundingClientRect().top >= 0), 'the focused skip link is visible');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
  assert.deepEqual(errors, []);
  await page.close();
});

function contrast(foreground, background) {
  const luminance = rgb => {
    const [r, g, b] = rgb
      .match(/\d+(\.\d+)?/g)
      .slice(0, 3)
      .map(Number)
      .map(c => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

test('chart rank badges are opaque and meet normal-text contrast', async () => {
  const { page } = await openCatalog('#apps');
  const badge = page.locator('.pinrank').first();
  await badge.waitFor();
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const { color, background } = await badge.evaluate(el => ({
      color: getComputedStyle(el).color,
      background: getComputedStyle(el).backgroundColor,
    }));
    assert.doesNotMatch(background, /rgba\([^)]*,\s*0?\.\d+\)/, 'the badge background is opaque over screenshots');
    assert(
      contrast(color, background) >= 4.5,
      `badge contrast ${contrast(color, background).toFixed(2)} at ${width}px`
    );
  }
  await page.close();
});

test('decorative hero motion stops within five seconds', async () => {
  const { page } = await openCatalog('#apps');
  await page.locator('.app-open').first().waitFor();
  // Read the declared timing: finished animations leave getAnimations(), so a slow load would hide them.
  const endTimes = await page.evaluate(() => {
    const seconds = value => value.split(',').map(part => parseFloat(part) * (part.trim().endsWith('ms') ? 0.001 : 1));
    return [...document.querySelectorAll('.hero *')].flatMap(el => {
      const style = getComputedStyle(el);
      if (style.animationName === 'none') return [];
      const durations = seconds(style.animationDuration),
        delays = seconds(style.animationDelay);
      return style.animationIterationCount.split(',').map((count, i) => {
        const iterations = count.trim() === 'infinite' ? Infinity : Number(count);
        return (delays[i % delays.length] + durations[i % durations.length] * iterations) * 1000;
      });
    });
  });
  assert(endTimes.length > 0, 'the hero animates on load');
  assert(
    endTimes.every(end => Number.isFinite(end) && end <= 5000),
    `hero animations end at ${endTimes.join(', ')}ms`
  );
  await page.close();
});

test('save and compare actions are named after their screenshot and report their state', async () => {
  const { page, errors } = await openCatalog('#screens');
  const save = page.getByRole('button', { name: 'Save Fixture App 01', exact: true }).first();
  await save.waitFor();
  assert.equal(await save.getAttribute('aria-pressed'), 'false');
  await save.click();
  const saved = page.getByRole('button', { name: 'Saved Fixture App 01', exact: true, pressed: true }).first();
  await saved.waitFor();
  const compare = page.getByRole('button', { name: 'Compare Fixture App 01', exact: true }).first();
  await compare.click();
  await page.getByRole('button', { name: 'Selected Fixture App 01', exact: true, pressed: true }).first().waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test('fields from another kind cannot change how a record browses', async () => {
  const { page, base, errors } = await openCatalog(null);
  const snapshot = fixtureSnapshot();
  snapshot.screens[0] = { ...snapshot.screens[0], name: 7, categories: {}, assetIds: 'x', chartRanks: [] };
  const reviewed = fixtureReviewedLibrary();
  reviewed.elements[0] = { ...reviewed.elements[0], assetIds: {} };
  reviewed.flows[0] = { ...reviewed.flows[0], screenId: 7, name: 'Not an app' };
  await page.route('**/data.json', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(snapshot) })
  );
  await page.route('**/curation.json', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(reviewed) })
  );
  await page.goto(base + '#screens');
  await page.locator('#content .pin').first().waitFor();
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('name');
  await page.getByRole('combobox', { name: 'Category' }).selectOption('Education');
  await page.getByRole('searchbox', { name: 'Search catalog' }).fill('Fixture App 01');
  assert.equal(await page.getByRole('button', { name: 'Open Fixture App 01', exact: true }).count(), 3);
  await page.goto(base + '#elements');
  await page.getByRole('button', { name: 'Open Tab bar', exact: true }).click();
  assert.equal(await page.locator('.screen-thumbnails button').count(), 1);
  await page.keyboard.press('Escape');
  await page.goto(base + '#flows');
  await page.getByRole('button', { name: 'Open Community and discovery', exact: true }).click();
  assert.equal(await page.locator('.screen-thumbnails button').count(), 3);
  assert.deepEqual(errors, []);
  await page.close();
});
