const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const curation = require('../site/curation.json');
const { catalogBase, launchBrowser, evidencePath, fixtureSnapshot } = require('./browser-fixture.cjs');

let browser;
before(async () => {
  browser = await launchBrowser();
});
after(() => browser?.close());

const appleImage =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1290" height="2796"><rect width="1290" height="2796" fill="#101010"/></svg>';

test('the viewer shows the full-resolution Apple image and falls back to the cached preview', async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2 });
  const base = await catalogBase(page);
  const screenIds = [...fixtureSnapshot().screens, ...curation.screens].map(screen => screen.id);
  const sources = Object.fromEntries(
    screenIds.map(id => [id, `https://is1-ssl.mzstatic.com/image/thumb/${id}/1290x2796bb.png`])
  );
  await page.route('**/image-sources.json', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(sources) })
  );
  await page.route(
    url => url.hostname.endsWith('-ssl.mzstatic.com'),
    route => route.fulfill({ contentType: 'image/svg+xml', body: appleImage })
  );
  await page.goto(base + '#flows');
  await page.getByRole('button', { name: 'Open Community and discovery' }).click();
  const img = page.locator('.screen-canvas img');
  await img.evaluate(i => i.decode());
  const dimensions = await img.evaluate(i => ({ width: i.naturalWidth, height: i.naturalHeight, url: i.currentSrc }));
  assert(dimensions.width >= 1000, JSON.stringify(dimensions));
  assert(dimensions.height >= 2000, JSON.stringify(dimensions));
  assert.match(dimensions.url, /1290x2796bb\.png$/);
  await page.keyboard.press('ArrowRight');
  await img.evaluate(i => i.decode());
  assert(await img.evaluate(i => i.naturalWidth >= 1000));
  await page.screenshot({ path: await evidencePath('sharp-viewer.png'), animations: 'disabled' });
  await page.route(
    url => url.hostname.endsWith('-ssl.mzstatic.com'),
    route => route.abort()
  );
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.screen-canvas img')?.currentSrc.includes('/assets/'));
  await img.evaluate(i => i.decode());
  assert(await img.evaluate(i => i.naturalWidth > 0));
  await page.close();
});
