const {chromium} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  const page = await browser.newPage();
  const base = process.env.CATALOG_TEST_URL || 'http://127.0.0.1:8765/';
  try {
    await page.goto(base + '#flows');
    await page.locator('.collection-card').first().waitFor();
    assert.equal(await page.locator('.collection-card').count(), 7);
    await page.locator('.collection-card').first().getByRole('button', {name:/Open/}).click();
    assert.match(await page.locator('#viewerContent').textContent(), /Listing collection · interaction order unverified/);
    assert.equal(await page.locator('.collection-detail figure').count(), 4);
    await page.locator('#viewerContent [data-save]').first().click();
    assert.equal(await page.locator('#viewerContent [data-save]').first().getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Escape');
    await page.getByRole('link', {name:'UI elements', exact:true}).click();
    await page.locator('.collection-card').first().waitFor();
    assert.equal(await page.locator('.collection-card').count(), 25);
    await page.locator('#search').fill('tab bar');
    assert((await page.locator('.collection-card').count()) > 0);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
    const exported = JSON.parse(require('node:fs').readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.route, 'elements');
    assert.equal(exported.records[0].screenId.length, 64);
    const malformed = await browser.newPage();
    await malformed.route('**/curation.json', route => route.fulfill({contentType:'application/json',body:JSON.stringify({flows:[null,{id:'bad',title:'Bad',assetIds:{}}],elements:[null]})}));
    await malformed.goto(base + '#apps');
    await malformed.locator('.app-open').first().waitFor();
    assert((await malformed.locator('.app-open').count()) > 0);
    console.log('PASS: curation collections, ordered modal annotation, screen actions, search, export');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
