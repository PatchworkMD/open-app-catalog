const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {catalogBase} = require('./browser-fixture.cjs');

(async () => {
  const browser = await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  try {
    const page = await browser.newPage();
    const errors = [], accountRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => {
      if (/firebase|cloud-boards\.mjs/.test(request.url())) accountRequests.push(request.url());
    });
    const base = await catalogBase(page);
    await page.goto(base + '#screens');
    await page.locator('#content [data-save]').first().waitFor();
    assert.equal(await page.getByRole('button',{name:'Account',exact:true}).count(),0);
    await page.locator('#content [data-save]').first().click();
    await page.getByRole('link',{name:'Saved board',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#title').textContent === 'Saved board');
    await page.reload();
    await page.locator('#content .pin').waitFor();
    const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
    const exported = JSON.parse(await fs.readFile(await download.path(),'utf8'));
    assert.equal(exported.records.length,1);
    assert.equal(exported.route,'boards');
    for (const width of [390,320]) {
      await page.setViewportSize({width,height:844});
      await page.screenshot({path:`/tmp/hugging-app-local-board-${width}.png`,animations:'disabled'});
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.getByRole('link',{name:'About & sources',exact:true}).click();
    await page.locator('#content .doc').waitFor();
    assert.doesNotMatch(await page.locator('#content').textContent(),/until you sign in|use a cloud board/);
    for (const route of ['apps','screens','flows','elements','boards','agents','plugin']) {
      await page.goto(base + '#' + route);
      await page.locator('#coverage').filter({hasText:'Snapshot'}).waitFor();
      if (['flows','elements'].includes(route)) await page.locator('.collection-card').first().waitFor();
    }
    assert.deepEqual(accountRequests,[]);
    assert.deepEqual(errors,[]);
    console.log('PASS: local boards persist and export without account requests, account UI, or console errors at 390px/320px');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
