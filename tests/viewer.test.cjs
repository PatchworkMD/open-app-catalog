const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { catalogBase, launchBrowser, evidencePath, fitsViewport } = require('./browser-fixture.cjs');

let browser;
before(async () => {
  browser = await launchBrowser();
});
after(() => browser?.close());

async function viewerPage() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const base = await catalogBase(page);
  await page.route(
    url => url.hostname.endsWith('-ssl.mzstatic.com'),
    route =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1290" height="2796"><rect width="1290" height="2796" fill="#101010"/></svg>',
      })
  );
  return {
    page,
    base,
    dialog: page.locator('#viewer'),
    cards: page.locator('.app-gallery .app-detail-card'),
    stage: page.locator('.screen-canvas img'),
  };
}

const SPATIAL = 'transform|translate|scale|rotate|all';
function spatialMotion(locator) {
  return locator.evaluate((el, pattern) => {
    const spatial = new RegExp(`^(${pattern})$`);
    const style = getComputedStyle(el);
    const durations = style.transitionDuration.split(',').map(parseFloat);
    const transitions = style.transitionProperty
      .split(',')
      .map(property => property.trim())
      .filter((property, i) => spatial.test(property) && durations[i % durations.length] > 0);
    const animations = el
      .getAnimations()
      .filter(animation =>
        animation.effect?.getKeyframes().some(frame => Object.keys(frame).some(key => spatial.test(key)))
      );
    return transitions.length + animations.length > 0;
  }, SPATIAL);
}

async function assertScreenFits(page, stage) {
  await stage.evaluate(img => img.decode());
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.screen-canvas img')).opacity === '1');
  assert(await page.locator('#viewerContent').evaluate(el => el.scrollHeight <= el.clientHeight + 1));
  const shot = await stage.boundingBox();
  const close = await page.getByRole('button', { name: 'Close viewer' }).boundingBox();
  assert(shot.height > 200 && shot.y >= 0 && shot.y + shot.height <= page.viewportSize().height);
  assert(close.y >= 0 && close.x + close.width <= page.viewportSize().width);
}

test('the app viewer shows a gallery, a sharp screenshot, keyboard steps, reduced motion and back navigation', async () => {
  const { page, base, dialog, cards, stage } = await viewerPage();
  await page.goto(base + '#apps', { waitUntil: 'domcontentloaded' });
  await page.locator('.app-open').first().waitFor();
  assert.equal(await dialog.isVisible(), false);

  await page.locator('.app-open').first().click();
  await dialog.waitFor({ state: 'visible' });
  await cards.first().waitFor();
  assert((await cards.count()) >= 2);
  await dialog.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
  const galleryWidth = await page.locator('.app-gallery').evaluate(el => el.getBoundingClientRect().width);
  const dialogWidth = await dialog.evaluate(el => el.getBoundingClientRect().width);
  assert(galleryWidth >= dialogWidth - 50, 'the gallery should fill the dialog content width');
  assert.equal(await page.getByRole('button', { name: 'Close viewer' }).isVisible(), true);
  await page.screenshot({ path: await evidencePath('app-detail.png'), animations: 'disabled' });
  await page.locator('#viewerContent').evaluate(el => (el.scrollTop = el.scrollHeight));
  assert.equal(await page.getByRole('button', { name: 'Close viewer' }).isVisible(), true);

  await cards.first().locator('.app-detail-image').click();
  await stage.waitFor({ state: 'visible' });
  await assertScreenFits(page, stage);
  await page.screenshot({ path: await evidencePath('screen-view.png'), animations: 'disabled' });
  const initial = await stage.getAttribute('src');
  assert(await page.getByRole('button', { name: 'Previous screenshot' }).isDisabled());
  await page.keyboard.press('ArrowRight');
  assert.notEqual(await stage.getAttribute('src'), initial);
  await stage.waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('button', { name: 'Back to app' }).isVisible(), true);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Screenshot 1', exact: true }).click();
  assert.equal(await stage.getAttribute('src'), initial);
  await stage.waitFor({ state: 'visible' });
  for (const moving of [stage, page.locator('.screen-thumbnails button').first(), dialog]) {
    assert.equal(await spatialMotion(moving), false);
  }
  await page.keyboard.press('ArrowRight');
  assert.notEqual(await stage.getAttribute('src'), initial);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-current')), 'true');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await stage.getAttribute('src'), initial);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#viewer [data-save]').click();
  assert.equal(await page.locator('#viewer [data-save]').getAttribute('aria-pressed'), 'true');
  await page.locator('#viewer [data-select]').click();
  await page.getByRole('button', { name: 'Next screenshot' }).click();
  await page.locator('#viewer [data-select]').click();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('#compare').click();
  assert.equal(await page.locator('.comparegrid .pin').count(), 2);
  await page.keyboard.press('Escape');

  await page.locator('.app-open').first().click();
  await page.locator('.app-detail-image').first().click();
  await page.getByRole('button', { name: 'Back to app' }).click();
  await cards.first().waitFor({ state: 'visible' });
  assert.equal(await page.locator('.app-gallery').isVisible(), true);

  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.close();
});

test('the app viewer fits 390px and 320px', async () => {
  const { page, base, cards, stage } = await viewerPage();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base + `?test=mobile-${width}#apps`, { waitUntil: 'domcontentloaded' });
    await page.locator('.app-open').first().click();
    await cards.first().waitFor({ state: 'visible' });
    assert(await fitsViewport(page));
    await page.locator('.app-detail-image').first().click();
    await stage.waitFor({ state: 'visible' });
    await assertScreenFits(page, stage);
    assert(await fitsViewport(page));
    await page.screenshot({ path: await evidencePath(`viewer-${width}.png`), animations: 'disabled' });
    await page.keyboard.press('Escape');
  }

  await page.close();
});

test('UI elements fit the viewport', async () => {
  const { page, base } = await viewerPage();
  await page.goto(base + '?test=elements#elements', { waitUntil: 'domcontentloaded' });
  await page.locator('.collection-card').first().waitFor();
  assert.equal(await page.locator('.collection-card').count(), 4);
  assert(await fitsViewport(page));
  await page.close();
});
