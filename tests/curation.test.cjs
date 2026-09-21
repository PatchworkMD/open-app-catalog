const {chromium} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  const page = await browser.newPage();
  if (process.env.CATALOG_SNAPSHOT) await page.route('**/data.json', route => route.fulfill({contentType:'application/json',body:require('node:fs').readFileSync(process.env.CATALOG_SNAPSHOT,'utf8')}));
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
    await page.waitForFunction(() => document.querySelector('#title').textContent === 'UI elements');
    assert.equal(await page.locator('.collection-card').count(), 25);
    assert.equal(await page.locator('#viewer').isVisible(), false);
    await page.screenshot({path:'/tmp/hugging-elements-fixed.png',animations:'disabled'});
    await page.locator('.collection-card').first().getByRole('button', {name:/Open/}).click();
    assert.equal(await page.locator('.screen-canvas img').count(), 1);
    assert.match(await page.locator('.screen-context').textContent(), /Reviewed/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#viewer').isVisible(), false);
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
