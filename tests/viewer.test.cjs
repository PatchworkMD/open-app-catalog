const {chromium} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  const page = await browser.newPage({viewport:{width:900,height:850}});
  const base = process.env.CATALOG_TEST_URL || 'http://127.0.0.1:8791/';
  try {
    await page.goto(base + '#apps');
    const dialog = page.locator('#viewer');
    assert.equal(await dialog.isVisible(), false);
    await page.locator('.app-open').first().click();
    await dialog.waitFor({state:'visible'});
    assert.equal(await page.locator('.screen-canvas img').count(), 1);
    assert((await page.locator('[data-thumb]').count()) >= 2);
    const assertFits = async () => {
      await page.locator('.screen-canvas img').evaluate(img => img.decode());
      assert(await page.locator('#viewerContent').evaluate(el => el.scrollHeight <= el.clientHeight + 1));
      const shot = await page.locator('.screen-canvas img').boundingBox();
      const close = await page.getByRole('button', {name:'Close viewer'}).boundingBox();
      assert(shot.height > 200 && shot.y >= 0 && shot.y + shot.height <= page.viewportSize().height);
      assert(close.y >= 0 && close.x + close.width <= page.viewportSize().width);
    };
    await assertFits();
    const initial = await page.locator('.screen-canvas img').getAttribute('src');
    assert(await page.getByRole('button', {name:'Previous screenshot'}).isDisabled());
    await page.keyboard.press('ArrowRight');
    assert.notEqual(await page.locator('.screen-canvas img').getAttribute('src'), initial);
    await page.locator('[data-thumb="0"]').click();
    assert.equal(await page.locator('.screen-canvas img').getAttribute('src'), initial);
    await page.locator('#viewer [data-save]').click();
    assert.equal(await page.locator('#viewer [data-save]').getAttribute('aria-pressed'), 'true');
    await page.locator('#viewer [data-select]').click();
    await page.getByRole('button', {name:'Next screenshot'}).click();
    await page.locator('#viewer [data-select]').click();
    await page.locator('.screen-canvas img').evaluate(img => img.decode());
    await page.screenshot({path:'/tmp/hugging-focused-viewer.png'});
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), false);
    await page.locator('#compare').click();
    assert.equal(await page.locator('.comparegrid .pin').count(), 2);
    await page.keyboard.press('Escape');
    await page.setViewportSize({width:390,height:844});
    await page.locator('.app-open').first().click();
    await assertFits();
    await page.screenshot({path:'/tmp/hugging-focused-mobile.png',animations:'disabled'});
    await page.goto(base + '#elements');
    await page.locator('.collection-card').first().waitFor();
    assert.equal(await dialog.isVisible(), false);
    assert.equal(await page.locator('.collection-card').count(),25);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    console.log('PASS: hidden closed dialog, complete screenshot fits, thumbnails, arrows, save/compare, mobile, section navigation');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
