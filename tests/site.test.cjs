// Run with the in-memory local preview route: node tests/site.test.cjs
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {catalogBase} = require('./browser-fixture.cjs');
(async () => {
  const browser = await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  const page = await browser.newPage({viewport:{width:800,height:600}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const base = await catalogBase(page);
  const evidenceRoot = process.env.QA_ARTIFACT_DIR ? path.resolve(process.env.QA_ARTIFACT_DIR) : path.resolve('.omo/evidence');
  await fs.mkdir(evidenceRoot, {recursive:true});
  const evidence = process.env.QA_ARTIFACT_DIR ? evidenceRoot : await fs.mkdtemp(path.join(evidenceRoot,'hugging-app-qa-'));
  try {
    await page.goto(base + '#apps');
    await page.locator('.app-open').first().waitFor();
    assert.equal(await page.locator('.app-open').count(),48);
    await page.locator('.app-open').first().press('Enter');
    assert.equal(await page.locator('#viewer.app-viewer').evaluate(el => el.open),true);
    const activeImage = page.locator('.app-viewer-canvas img');
    await activeImage.waitFor();
    await page.waitForFunction(() => {
      const image = document.querySelector('.app-viewer-canvas img');
      return image?.complete && image.naturalWidth > 0;
    });
    assert((await activeImage.getAttribute('src')).endsWith('/1290x2796bb.png'));
    assert((await page.locator('.app-viewer-thumbnails button').count()) > 1);
    const toolbar = await page.locator('.app-viewer-toolbar').boundingBox();
    assert(toolbar && toolbar.y + toolbar.height <= 600,'app actions must remain visible at 800x600');
    const imageSize = await activeImage.evaluate(image => {
      const box = image.getBoundingClientRect();
      return {naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,width:box.width,height:box.height};
    });
    assert(Math.abs(imageSize.width / imageSize.height - imageSize.naturalWidth / imageSize.naturalHeight) < 0.03,'active screenshot must keep its aspect ratio');
    const originalThumb = await page.locator('.app-viewer-thumbnails [aria-current="true"]').getAttribute('data-thumb');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('.app-viewer-thumbnails [aria-current="true"]').getAttribute('data-thumb'),String(Number(originalThumb) + 1));
    await page.keyboard.press('ArrowLeft');
    const save = page.locator('.app-viewer-toolbar [data-save]');
    await save.click(); assert.equal(await save.getAttribute('aria-pressed'),'true');
    await save.click(); assert.equal(await save.getAttribute('aria-pressed'),'false');
    const compare = page.locator('.app-viewer-toolbar [data-select]');
    await compare.click(); assert.equal(await compare.getAttribute('aria-pressed'),'true');
    await compare.click(); assert.equal(await compare.getAttribute('aria-pressed'),'false');
    const sourceUrl = await page.locator('.app-viewer-toolbar a').first().getAttribute('href');
    assert(sourceUrl && (sourceUrl.startsWith('https://apps.apple.com/') || sourceUrl.startsWith('https://itunes.apple.com/')));
    await page.screenshot({path:path.join(evidence,'app-viewer-800x600.png')});
    await page.locator('.app-detail-image img').first().waitFor();
    await page.waitForFunction(() => { const image = document.querySelector('.app-detail-image img'); return image?.complete && image.naturalWidth > 0; });
    await page.screenshot({path:path.join(evidence,'app-detail.png')});
    await page.locator('.app-detail-image').first().click();
    await page.locator('#viewer.screen-viewer').waitFor();
    await page.waitForFunction(() => { const image = document.querySelector('.screen-canvas img'); return image?.complete && image.naturalWidth > 0; });
    await page.screenshot({path:path.join(evidence,'screen-viewer.png')});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#viewer').evaluate(el => el.open),false);
    await page.setViewportSize({width:1440,height:1000});
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
      if (['flows','elements'].includes(route)) {
        const card = page.locator('.collection-card').first();
        await card.waitFor();
        assert((await page.locator('.collection-card').count()) > 0);
        const header = await card.locator('.collection-card-header').boundingBox();
        const preview = await card.locator('.collection-previews').boundingBox();
        assert(header && preview && header.y + header.height <= preview.y,'card hierarchy must precede the screenshot preview');
        assert(await card.locator('.collection-title').innerText());
        assert(await card.locator('.collection-meta').innerText());
        assert(await card.locator('.collection-open').isVisible());
        assert.equal(await card.locator('.collection-type').textContent(),route === 'flows' ? 'Listing collection' : 'UI element');
        await page.screenshot({path:path.join(evidence,route + '-cards.png')});
        await card.locator('.collection-open').click();
        await page.locator('#viewer.screen-viewer').waitFor();
        await page.keyboard.press('Escape');
      }
    }
    const retinaPage = await browser.newPage({viewport:{width:800,height:600},deviceScaleFactor:2});
    await catalogBase(retinaPage);
    await retinaPage.goto(base + '#elements');
    const retinaPreview = retinaPage.locator('.collection-preview-button img').first();
    await retinaPreview.waitFor();
    await retinaPage.waitForFunction(() => {
      const image = document.querySelector('.collection-preview-button img');
      return image?.complete && image.naturalWidth > 0;
    });
    assert.equal(await retinaPreview.getAttribute('loading'),'lazy');
    assert((await retinaPreview.getAttribute('srcset')).includes('/1290x2796bb.png 2x'));
    assert((await retinaPreview.evaluate(image => image.currentSrc)).endsWith('/1290x2796bb.png'),'Retina cards should use a sharp source');
    await retinaPage.goto(base + '#flows');
    const collectionThumb = retinaPage.locator('.collection-preview-button img').first();
    await collectionThumb.waitFor();
    const flowSrcset = await collectionThumb.getAttribute('srcset');
    assert(flowSrcset.includes('/640x1386bb.jpg 2x'),'small collection previews should keep the lighter Retina source');
    assert(!flowSrcset.includes('/1290x2796bb.png'),'small collection previews should not request full-size assets');
    await retinaPage.close();

    const overlap = await browser.newPage({viewport:{width:800,height:600}});
    overlap.on('pageerror', e => errors.push(e.message));
    const overlapBase = await catalogBase(overlap);
    const overlapData = JSON.parse(await fs.readFile(path.join(__dirname,'../site/data.json'),'utf8'));
    overlapData.apps = overlapData.apps.filter(app => app.assetIds?.length).slice(0,2);
    assert.equal(overlapData.apps.length,2);
    overlapData.coverage = {...overlapData.coverage,rankBasis:'original-category-feed'};
    for (const [i, app] of overlapData.apps.entries()) {
      app.chartMemberships = [{name:app.category,rank:i + 1},{name:'Integration category',rank:2 - i}];
    }
    await overlap.route('**/data.json',route => route.fulfill({status:200,json:overlapData}));
    await overlap.goto(overlapBase + '#apps');
    await overlap.locator('.app-open').first().waitFor();
    await overlap.locator('#category').selectOption({label:'Integration category'});
    assert.equal(await overlap.locator('.app-open').count(),2);
    assert.equal(await overlap.locator('.app-open').first().getAttribute('data-related'),overlapData.apps[1].id);
    assert.equal(await overlap.locator('.pinrank').first().textContent(),'#1 in Integration category');
    await overlap.locator('.app-open').first().click();
    await overlap.locator('#viewer.app-viewer').waitFor();
    assert((await overlap.locator('.app-viewer-meta').textContent()).startsWith('Integration category · '));
    assert.equal(await overlap.locator('.app-viewer-thumbnails button').count(),overlapData.apps[1].assetIds.length);
    await overlap.screenshot({path:path.join(evidence,'app-viewer-secondary-category.png')});
    await overlap.close();


    await page.setViewportSize({width:390,height:844});
    await page.goto(base + '#apps'); await page.locator('.app-open').first().waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.app-open').first().press('Enter');
    await page.locator('#viewer.app-viewer').waitFor();
    await page.waitForFunction(() => {
      const image = document.querySelector('.app-viewer-canvas img');
      return image?.complete && image.naturalWidth > 0;
    });
    const mobileToolbar = await page.locator('.app-viewer-toolbar').boundingBox();
    assert(mobileToolbar && mobileToolbar.y + mobileToolbar.height <= 844,'app controls must remain visible on mobile');
    await page.screenshot({path:path.join(evidence,'app-viewer-mobile.png')});
    await page.keyboard.press('Escape');
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
    const transitionErrors = [];
    const transitionPage = await browser.newPage({viewport:{width:1280,height:900}});
    transitionPage.on('pageerror', error => transitionErrors.push(error.message));
    await transitionPage.addInitScript(() => {
      window.__viewTransitions = [];
      window.__unhandledTransitions = [];
      window.addEventListener('unhandledrejection', event => window.__unhandledTransitions.push(String(event.reason)));
      document.startViewTransition = callback => {
        let rejectReady, resolveFinished;
        const ready = new Promise((_, reject) => { rejectReady = reject; });
        const finished = new Promise(resolve => { resolveFinished = resolve; });
        const transition = {
          ready,
          finished,
          skipped:false,
          skipTransition() {
            this.skipped = true;
            rejectReady(new Error('Transition was skipped. New ViewTransition started'));
            resolveFinished();
          }
        };
        window.__viewTransitions.push(transition);
        callback();
        return transition;
      };
    });
    const transitionBase = await catalogBase(transitionPage);
    await transitionPage.goto(transitionBase + '#apps');
    await transitionPage.locator('.app-open').first().waitFor();
    await transitionPage.evaluate(() => { location.hash = '#screens'; });
    await transitionPage.waitForFunction(() => document.querySelector('#title').textContent === 'Screens');
    await transitionPage.evaluate(() => { location.hash = '#flows'; });
    await transitionPage.waitForFunction(() => document.querySelector('#title').textContent === 'Flows');
    assert.deepEqual(await transitionPage.evaluate(() => ({
      count:window.__viewTransitions.length,
      skipped:window.__viewTransitions[0]?.skipped
    })),{count:1,skipped:true});
    assert.deepEqual(transitionErrors,[]);
    assert.deepEqual(await transitionPage.evaluate(() => window.__unhandledTransitions),[]);
    await transitionPage.close();

    const chromiumTransitionErrors = [];
    const chromiumTransitionPage = await browser.newPage({viewport:{width:1280,height:900}});
    chromiumTransitionPage.on('pageerror', error => chromiumTransitionErrors.push(error.message));
    await chromiumTransitionPage.addInitScript(() => {
      window.__unhandledTransitions = [];
      window.addEventListener('unhandledrejection', event => window.__unhandledTransitions.push(String(event.reason)));
    });
    const chromiumBase = await catalogBase(chromiumTransitionPage);
    await chromiumTransitionPage.goto(chromiumBase + '#apps');
    await chromiumTransitionPage.locator('.app-open').first().waitFor();
    assert.equal(await chromiumTransitionPage.evaluate(() =>
      typeof document.startViewTransition === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches
    ),true,'Chromium View Transitions should be enabled for this scenario');
    await chromiumTransitionPage.addStyleTag({content:'::view-transition-old(root),::view-transition-new(root){animation-duration:2s!important}'});
    await chromiumTransitionPage.evaluate(() => { location.hash = '#screens'; });
    await chromiumTransitionPage.waitForFunction(() => document.querySelector('#title').textContent === 'Screens');
    await chromiumTransitionPage.evaluate(async () => {
      await new Promise(resolve => setTimeout(resolve,0));
      location.hash = '#flows';
    });
    await chromiumTransitionPage.waitForFunction(() => document.querySelector('#title').textContent === 'Flows');
    assert.deepEqual(chromiumTransitionErrors,[]);
    assert.deepEqual(await chromiumTransitionPage.evaluate(() => window.__unhandledTransitions),[]);
    await chromiumTransitionPage.close();
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
