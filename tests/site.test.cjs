// Run with the in-memory local preview route: node tests/site.test.cjs
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {catalogBase} = require('./browser-fixture.cjs');
(async () => {
  const browser = await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const base = await catalogBase(page);
  const evidence = await fs.mkdtemp(path.join(os.tmpdir(),'hugging-app-qa-'));
  try {
    await page.goto(base + '#apps');
    await page.locator('.app-open').first().waitFor();
    assert.equal(await page.locator('.app-open').count(),48);
    await page.locator('.app-open').first().press('Enter');
    assert.equal(await page.locator('#viewer').evaluate(el => el.open),true);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.scrollTo(0,0));
    await page.screenshot({path:path.join(evidence,'desktop.png')});
    await page.getByRole('link',{name:'Screens',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#title').textContent === 'Screens');
    await page.locator('#content [data-save]').first().click();
    await page.locator('#content [data-select]').nth(0).click();
    await page.locator('#content [data-select]').nth(1).click();
    await page.locator('#compare').click();
    assert.equal(await page.locator('.comparegrid .pin').count(),2);
    await page.locator('#viewer [data-save]').first().click();
    assert.equal(await page.locator('#content [data-save]').first().getAttribute('aria-pressed'),'false');
    await page.keyboard.press('Escape');
    await page.locator('#content [data-save]').first().click();
    await page.getByRole('link',{name:'Saved board',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#title').textContent === 'Saved board');
    assert.equal(await page.locator('#content .pin').count(),1);
    await page.locator('#newBoard').click();
    await page.locator('#boardName').fill('Research shortlist');
    await page.locator('#boardCreateForm button[type="submit"]').click();
    await page.getByText('Your board is empty.',{exact:true}).waitFor();
    const boardOptions = await page.locator('#boardSelect option').allTextContents();
    assert(boardOptions.some(x => x.includes('Saved board')));
    assert(boardOptions.some(x => x.includes('Research shortlist')));
    await page.locator('#boardSelect').selectOption({label:'Saved board · this device'});
    assert.equal(await page.locator('#content .pin').count(),1);
    await page.locator('#boardSelect').selectOption({label:'Research shortlist · this device'});
    await page.getByText('Your board is empty.',{exact:true}).waitFor();
    await page.locator('#boardSelect').selectOption({label:'Saved board · this device'});
    await page.locator('#accountButton').click();
    assert.equal(await page.locator('#accountDialog').evaluate(el => el.open),true);
    await page.getByText('Cloud sync is off. Your saved board stays on this device.',{exact:true}).waitFor();
    await page.locator('#accountSetup').evaluate(el => { el.hidden = true; });
    await page.locator('#accountSignedOut').evaluate(el => { el.hidden = false; });
    await page.locator('#authToggle').click();
    assert.equal(await page.locator('#authMode').inputValue(),'signup');
    assert.equal(await page.locator('#authSubmit').textContent(),'Create account');
    assert.equal(await page.locator('#authToggle').getAttribute('aria-pressed'),'true');
    await page.locator('#authToggle').click();
    assert.equal(await page.locator('#authMode').inputValue(),'signin');
    assert.equal(await page.locator('#authToggle').getAttribute('aria-pressed'),'false');
    await page.locator('#accountClose').click();
    const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
    const exported = JSON.parse(await fs.readFile(await download.path(),'utf8'));
    assert.equal(exported.records.length,1); assert.equal(exported.route,'boards');
    await page.reload(); await page.locator('#content .pin').waitFor();
    await page.locator('#content [data-save]').click();
    await page.getByText('Your board is empty.',{exact:true}).waitFor();
    await page.goto(base + '#screens');
    await page.locator('#search').fill('zzzz-no-such-app-zzzz');
    await page.getByText('No matching results',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Clear filters'}).click();
    assert.equal(await page.locator('#content .pin').count(),48);
    await page.locator('#category').selectOption('Education');
    assert((await page.locator('#content .pinmeta').allTextContents()).every(x => x==='Education'));
    for (const route of ['flows','elements','agents','plugin','unknown']) {
      await page.goto(base + '#' + route);
      const title = ({flows:'Flows',elements:'UI elements',agents:'About & sources',plugin:'Hugging App plugin'})[route] || 'Apps';
      await page.waitForFunction(expected => document.querySelector('#title').textContent === expected, title);
      await page.waitForFunction(() => document.querySelector('#coverage').textContent.includes('Snapshot'));
      if (['agents','plugin'].includes(route)) assert.equal(await page.locator('#export').isVisible(),false);
      if (route==='unknown') assert.equal(await page.locator('#title').textContent(),'Apps');
    }
    await page.setViewportSize({width:390,height:844});
    await page.goto(base + '#apps'); await page.locator('.app-open').first().waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path:path.join(evidence,'mobile.png')});
    await page.goto(base + '#plugin'); await page.locator('#content .doc h2').waitFor();
    await page.screenshot({path:path.join(evidence,'plugin.png')});
    const syncPage = await browser.newPage();
    const syncBase = await catalogBase(syncPage);
    await syncPage.route('**/account-sync.js*',route => route.abort());
    await syncPage.addInitScript(() => {
      localStorage.setItem('oac-active-board','cloud-1');
      localStorage.setItem('oac-boards-v1',JSON.stringify([{
        id:'cloud-1',localId:'local-1',cloudId:'cloud-1',ownerUid:'owner-1',name:'Research',
        syncBaseAppIds:['keep','remove'],appIds:['keep','local-add'],
        syncBaseCollectionIds:['flow-keep','flow-remove'],collectionIds:['flow-keep','local-flow']
      }]));
    });
    await syncPage.goto(syncBase + '#boards');
    await syncPage.locator('#coverage').waitFor();
    const remote = {id:'cloud-1',localId:'local-1',cloudId:'cloud-1',ownerUid:'owner-1',name:'Research',
      appIds:['keep','remove','remote-add'],collectionIds:['flow-keep','flow-remove','remote-flow']};
    await syncPage.evaluate(record => window.huggingApp.setCloudBoards([record],{uid:'owner-1'}),remote);
    let reconciled = await syncPage.evaluate(() => window.huggingApp.getActiveBoard());
    assert.deepEqual(new Set(reconciled.appIds),new Set(['keep','local-add','remote-add']));
    assert.deepEqual(new Set(reconciled.collectionIds),new Set(['flow-keep','local-flow','remote-flow']));
    await syncPage.evaluate(record => window.huggingApp.applyCloudBoard({...record,appIds:[...record.appIds,'new-remote'],collectionIds:[...record.collectionIds,'new-flow']}),remote);
    reconciled = await syncPage.evaluate(() => window.huggingApp.getActiveBoard());
    assert(reconciled.appIds.includes('local-add') && reconciled.appIds.includes('new-remote'));
    assert(reconciled.collectionIds.includes('local-flow') && reconciled.collectionIds.includes('new-flow'));
    await syncPage.close();
    const blocked = await browser.newPage();
    await catalogBase(blocked);
    await blocked.route('**/data.json',route => route.fulfill({status:503,body:'Unavailable'}));
    await blocked.goto(base); await blocked.getByRole('button',{name:'Try again'}).waitFor();
    assert.equal(await blocked.locator('#export').isEnabled(),false);
    await blocked.close();
    const storage = await browser.newPage();
    await catalogBase(storage);
    await storage.addInitScript(() => { Storage.prototype.setItem = () => {throw new Error('denied')}; });
    await storage.goto(base + '#screens'); await storage.locator('[data-save]').first().click();
    assert.match(await storage.locator('#status').textContent(),/Storage unavailable/);
    await storage.close();
    assert.deepEqual(errors,[]);
    console.log('PASS: keyboard, comparison sync, multi-board persistence/export, account fallback/signup toggle, cloud edit reconciliation, filters, routes, mobile, load failure, storage failure');
    console.log('Screenshots: ' + evidence);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
