const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { catalogBase, launchBrowser } = require('./browser-fixture.cjs');

let browser;

before(async () => {
  browser = await launchBrowser();
});

after(() => browser?.close());

const firstAppName = page =>
  page
    .locator('.app-open')
    .first()
    .getAttribute('aria-label')
    .then(label => label.replace(/^Open /, ''));

test('app card images load eagerly and decode', async () => {
  const page = await browser.newPage();
  const base = await catalogBase(page);
  await page.goto(base + '#apps');
  await page.locator('.app-open').first().waitFor();

  for (const index of [0, 1]) {
    const img = page.locator('.app-open').nth(index).locator('img');
    assert.equal(await img.getAttribute('loading'), 'eager');
    await img.evaluate(e => e.decode());
    assert(await img.evaluate(e => e.naturalWidth > 0));
    assert.equal(await img.evaluate(e => e.classList.contains('loaded')), true);
  }

  await page.close();
});

test('a stalled image shows a loading state, then an unavailable state when it fails', async () => {
  const probe = await browser.newPage();
  const base = await catalogBase(probe);
  await probe.goto(base + '#apps');
  await probe.locator('.app-open').first().waitFor();
  const name = await firstAppName(probe);

  const src = await probe
    .getByRole('button', { name: 'Open ' + name, exact: true })
    .locator('img')
    .getAttribute('src');

  await probe.close();

  const stalled = await browser.newPage();
  await catalogBase(stalled);
  let release;

  const gate = new Promise(resolve => {
    release = resolve;
  });

  await stalled.route('**/' + src, async route => {
    await gate;
    await route.fulfill({ status: 404, body: '' });
  });
  await stalled.goto(base + '#apps', { waitUntil: 'domcontentloaded' });
  await stalled.getByRole('searchbox', { name: 'Search catalog' }).fill(name);
  const card = stalled.getByRole('button', { name: 'Open ' + name, exact: true });
  await card.waitFor();
  await stalled.waitForFunction(label => {
    const media = document.querySelector(`.app-open[aria-label="${label}"] .pinmedia`);

    return media && getComputedStyle(media, '::after').content.includes('Loading image');
  }, 'Open ' + name);
  release();
  await card.getByText('Image unavailable', { exact: true }).waitFor();
  await stalled.close();
});
