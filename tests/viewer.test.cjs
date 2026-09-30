const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {catalogBase} = require('./browser-fixture.cjs');

const artifactDir = process.env.QA_ARTIFACT_DIR || '/tmp';
fs.mkdirSync(artifactDir, {recursive:true});
const screenshot = name => path.join(artifactDir, name);

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
    assert.equal(await dialog.evaluate(element => element.classList.contains('app-viewer')), true);
    assert.equal(await page.locator('.app-viewer-stage').count(), 1);
    assert.equal(await page.locator('.app-viewer-identity').count(), 1);
    assert.equal(await page.locator('.app-viewer-toolbar').count(), 1);

    const stage = page.locator('.app-viewer-canvas img');
    const thumbnails = page.locator('.app-viewer-thumbnails button');
    await stage.waitFor({state:'visible'});
    assert((await thumbnails.count()) >= 2);
    await page.waitForFunction(() => {
      const image = document.querySelector('.app-viewer-canvas img');
      return image && image.complete && image.naturalWidth > 0 && image.classList.contains('loaded');
    });

    const assertViewerFits = async () => {
      assert(await page.locator('#viewerContent').evaluate(element => element.scrollHeight <= element.clientHeight + 1));
      const image = await stage.boundingBox();
      const close = await page.getByRole('button',{name:'Close viewer'}).boundingBox();
      assert(image && image.height > 200 && image.y >= 0 && image.y + image.height <= page.viewportSize().height);
      assert(close && close.y >= 0 && close.x + close.width <= page.viewportSize().width);
    };
    await assertViewerFits();
    await page.screenshot({path:screenshot('app-viewer-desktop.png'),animations:'disabled'});

    const initial = await stage.getAttribute('src');
    assert(await page.getByRole('button',{name:'Previous screenshot'}).isDisabled());
    await page.keyboard.press('ArrowRight');
    await page.locator('.app-viewer-thumbnails [data-thumb="1"][aria-current="true"]').waitFor();
    assert.notEqual(await stage.getAttribute('src'), initial);
    assert.equal(await page.locator('.app-viewer-position').textContent(), '2 / ' + await thumbnails.count());
    assert.equal(await page.locator('.app-viewer-thumbnails [aria-current="true"]').evaluate(element => element === document.activeElement), true);

    await page.locator('.app-viewer-thumbnails [data-thumb="0"]').click();
    assert.equal(await stage.getAttribute('src'), initial);
    assert.equal(await page.locator('.app-viewer-thumbnails [data-thumb="0"]').getAttribute('aria-current'), 'true');

    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('.app-viewer-thumbnails [data-thumb="1"]').click();
    await page.waitForFunction(() => document.querySelector('.app-viewer-canvas img')?.classList.contains('loaded'));
    assert.equal(await stage.evaluate(image => getComputedStyle(image).animationName), 'none');
    const reducedThumbnailMotion = await thumbnails.first().evaluate(button => ({
      property:getComputedStyle(button).transitionProperty,
      duration:getComputedStyle(button).transitionDuration
    }));
    assert.equal(reducedThumbnailMotion.property, 'none');
    assert.equal(reducedThumbnailMotion.duration, '0s');

    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('#viewer [data-save]').click();
    assert.equal(await page.locator('#viewer [data-save]').getAttribute('aria-pressed'), 'true');
    await page.locator('#viewer [data-select]').click();
    await page.getByRole('button',{name:'Next screenshot'}).click();
    await page.locator('#viewer [data-select]').click();
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    await page.locator('#compare').click();
    assert.equal(await page.locator('.comparegrid .pin').count(), 2);
    await page.keyboard.press('Escape');

    await page.setViewportSize({width:390,height:844});
    await page.goto(base + '?test=mobile#apps', {waitUntil:'domcontentloaded'});
    await page.locator('.app-open').first().click();
    await page.locator('.app-viewer-stage').waitFor();
    const mobilePrevious = await page.getByRole('button',{name:'Previous screenshot'}).boundingBox();
    const mobileNext = await page.getByRole('button',{name:'Next screenshot'}).boundingBox();
    assert(mobilePrevious && mobilePrevious.width >= 40 && mobilePrevious.height >= 40);
    assert(mobileNext && mobileNext.width >= 40 && mobileNext.height >= 40);
    await assertViewerFits();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path:screenshot('app-viewer-mobile.png'),animations:'disabled'});
    await page.keyboard.press('Escape');

    await page.goto(base + '?test=elements#elements', {waitUntil:'domcontentloaded'});
    await page.locator('.collection-card').first().waitFor();
    assert.equal(await page.locator('.collection-card').count(), 25);
    assert.equal(await page.locator('.collection-title').count(), 25);
    assert.equal(await page.locator('.collection-open').count(), 25);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    console.log('PASS: one-screen app viewer, keyboard and thumbnail navigation, reduced motion, save/compare, mobile controls and curation cards');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
