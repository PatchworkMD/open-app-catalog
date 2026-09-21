const {chromium} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const base = process.env.CATALOG_TEST_URL || 'http://127.0.0.1:8791/';
  try {
    await page.goto(base + '#apps');
    await page.locator('.app-open').first().click();
    const dialog = page.locator('#viewer');
    await dialog.waitFor({state:'visible'});
    const cards = page.locator('.app-gallery .app-detail-card');
    assert((await cards.count()) >= 2);
    assert.equal(await page.locator('.app-gallery .app-detail-caption').first().textContent().then(x => x.includes('Screenshot 1')), true);
    const dialogWidth = await dialog.evaluate(el => el.getBoundingClientRect().width);
    const galleryWidth = await page.locator('.app-gallery').evaluate(el => el.getBoundingClientRect().width);
    assert(galleryWidth > 1000 && galleryWidth > dialogWidth * .85);
    const close = page.getByRole('button', {name:'Close viewer'});
    await page.locator('#viewerContent').evaluate(el => el.scrollTop = el.scrollHeight);
    assert(await close.isVisible());
    assert((await close.boundingBox()).y >= 0);
    await cards.first().getByRole('button', {name:'Save'}).click();
    assert.equal(await cards.first().getByRole('button', {name:'Saved'}).getAttribute('aria-pressed'), 'true');
    await cards.nth(0).getByRole('button', {name:'Compare'}).click();
    await cards.nth(1).getByRole('button', {name:'Compare'}).click();
    await page.keyboard.press('Escape');
    await page.locator('#compare').click();
    assert.equal(await page.locator('.comparegrid .pin').count(), 2);
    await page.keyboard.press('Escape');
    await page.setViewportSize({width:390,height:844});
    await page.locator('.app-open').first().click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert(await close.isVisible());
    const bounds = await close.boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    console.log('PASS: app detail gallery width, fixed close action, save/compare, mobile layout');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
