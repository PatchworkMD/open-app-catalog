const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const {catalogBase} = require('./browser-fixture.cjs');

(async () => {
  const browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const base = await catalogBase(page);
    await page.goto(base + '#apps', {waitUntil:'domcontentloaded'});
    await page.locator('.app-open').first().waitFor();
    const dialog = page.locator('#viewer');
    assert.equal(await dialog.isVisible(), false);

    await page.locator('.app-open').first().click();
    await dialog.waitFor({state:'visible'});
    const cards = page.locator('.app-gallery .app-detail-card');
    await cards.first().waitFor();
    assert((await cards.count()) >= 2);
    const galleryWidth = await page.locator('.app-gallery').evaluate(el => el.getBoundingClientRect().width);
    const dialogWidth = await dialog.evaluate(el => el.getBoundingClientRect().width);
    assert(galleryWidth >= dialogWidth - 50, 'the gallery should fill the dialog content width');
    assert.equal(await page.getByRole('button',{name:'Close viewer'}).isVisible(),true);
    await page.screenshot({path:'/tmp/hugging-app-app-detail.png',animations:'disabled'});
    await page.locator('#viewerContent').evaluate(el => el.scrollTop = el.scrollHeight);
    assert.equal(await page.getByRole('button',{name:'Close viewer'}).isVisible(),true);

    await cards.first().locator('.app-detail-image').click();
    const stage = page.locator('.screen-canvas img');
    await stage.waitFor({state:'visible'});
    const assertScreenFits = async () => {
      await stage.evaluate(img => img.decode());
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.screen-canvas img')).opacity === '1');
      assert(await page.locator('#viewerContent').evaluate(el => el.scrollHeight <= el.clientHeight + 1));
      const shot = await stage.boundingBox();
      const close = await page.getByRole('button',{name:'Close viewer'}).boundingBox();
      assert(shot.height > 200 && shot.y >= 0 && shot.y + shot.height <= page.viewportSize().height);
      assert(close.y >= 0 && close.x + close.width <= page.viewportSize().width);
    };
    await assertScreenFits();
    await page.screenshot({path:'/tmp/hugging-app-screen-view.png',animations:'disabled'});
    const initial = await stage.getAttribute('src');
    assert(await page.getByRole('button',{name:'Previous screenshot'}).isDisabled());
    await page.keyboard.press('ArrowRight');
    assert.notEqual(await stage.getAttribute('src'),initial);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.screen-canvas img')).animationName === 'viewerImageIn');
    assert.equal(await page.getByRole('button',{name:'Back to app'}).isVisible(),true);

    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('[data-thumb="0"]').click();
    assert.equal(await stage.getAttribute('src'),initial);
    assert.equal(await stage.evaluate(img => getComputedStyle(img).animationName),'none');
    const reducedMotion = await page.locator('.screen-thumbnails button').first().evaluate(button => ({properties:getComputedStyle(button).transitionProperty,duration:getComputedStyle(button).transitionDuration}));
    assert.match(reducedMotion.properties,/border-color/);
    assert.doesNotMatch(reducedMotion.properties,/transform/);
    assert.equal(reducedMotion.duration,'0.1s');
    const reducedDialogMotion = await dialog.evaluate(el => ({properties:getComputedStyle(el).transitionProperty,duration:getComputedStyle(el).transitionDuration}));
    assert.match(reducedDialogMotion.properties,/opacity/);
    assert.doesNotMatch(reducedDialogMotion.properties,/transform|display|overlay/);
    assert.equal(reducedDialogMotion.duration,'0.1s');

    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('#viewer [data-save]').click();
    assert.equal(await page.locator('#viewer [data-save]').getAttribute('aria-pressed'),'true');
    await page.locator('#viewer [data-select]').click();
    await page.getByRole('button',{name:'Next screenshot'}).click();
    await page.locator('#viewer [data-select]').click();
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    await page.locator('#compare').click();
    assert.equal(await page.locator('.comparegrid .pin').count(),2);
    await page.keyboard.press('Escape');

    await page.locator('.app-open').first().click();
    await page.locator('.app-detail-image').first().click();
    await page.getByRole('button',{name:'Back to app'}).click();
    await cards.first().waitFor({state:'visible'});
    assert.equal(await page.locator('.app-gallery').isVisible(),true);

    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    await page.setViewportSize({width:390,height:844});
    await page.goto(base + '?test=mobile#apps',{waitUntil:'domcontentloaded'});
    await page.locator('.app-open').first().click();
    await cards.first().waitFor({state:'visible'});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.app-detail-image').first().click();
    await stage.waitFor({state:'visible'});
    await assertScreenFits();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path:'/tmp/hugging-focused-mobile.png',animations:'disabled'});
    await page.keyboard.press('Escape');

    await page.goto(base + '?test=elements#elements',{waitUntil:'domcontentloaded'});
    await page.locator('.collection-card').first().waitFor();
    assert.equal(await page.locator('.collection-card').count(),25);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    console.log('PASS: app overview, clickable screenshots, back navigation, sharp viewer, keyboard, save/compare, reduced motion, mobile and UI elements');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
