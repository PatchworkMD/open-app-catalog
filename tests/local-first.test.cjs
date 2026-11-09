const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { catalogBase, launchBrowser, evidencePath, fitsViewport } = require('./browser-fixture.cjs');

let browser;

before(async () => {
  browser = await launchBrowser();
});

after(() => browser?.close());

async function watchedPage() {
  const page = await browser.newPage();

  const errors = [],
    accountRequests = [];

  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', request => {
    if (/firebase|cloud-boards\.mjs/.test(request.url())) accountRequests.push(request.url());
  });

  return { page, errors, accountRequests, base: await catalogBase(page) };
}

test('a local board persists across reloads and exports at 390px and 320px', async () => {
  const { page, base, errors } = await watchedPage();
  await page.goto(base + '#screens');
  await page.locator('#content [data-save]').first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Account', exact: true }).count(), 0);
  await page.locator('#content [data-save]').first().click();
  await page.getByRole('link', { name: 'Saved board', exact: true }).click();
  await page.getByRole('heading', { name: 'Saved board', level: 1 }).waitFor();
  await page.reload();
  await page.locator('#content .pin').waitFor();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export data' }).click(),
  ]);

  const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  assert.equal(exported.records.length, 1);
  assert.equal(exported.route, 'boards');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({ path: await evidencePath(`local-board-${width}.png`), animations: 'disabled' });
    assert(await fitsViewport(page));
  }

  assert.deepEqual(errors, []);
  await page.close();
});

test('no route requests account code, shows account copy or logs console errors', async () => {
  const { page, base, errors, accountRequests } = await watchedPage();
  await page.goto(base + '#agents');
  await page.locator('#content .doc').waitFor();
  assert.doesNotMatch(await page.locator('#content').textContent(), /until you sign in|use a cloud board/);

  for (const route of ['apps', 'screens', 'flows', 'elements', 'boards', 'agents', 'plugin']) {
    await page.goto(base + '#' + route);
    await page.locator('#coverage').filter({ hasText: 'Snapshot' }).waitFor();

    if (['flows', 'elements'].includes(route)) await page.locator('.collection-card').first().waitFor();
  }

  assert.deepEqual(accountRequests, []);
  assert.deepEqual(errors, []);
  await page.close();
});
