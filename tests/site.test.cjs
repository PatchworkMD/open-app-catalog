const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { catalogBase, launchBrowser, evidencePath, fitsViewport } = require('./browser-fixture.cjs');

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
