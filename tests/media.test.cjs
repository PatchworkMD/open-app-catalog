const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {catalogBase}=require('./browser-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();
  const base=await catalogBase(page);
  await page.goto(base+'#apps');
  await page.locator('.app-open').first().waitFor();
  const images=page.locator('.app-open img');
  assert((await images.count())>=2,'the current catalog should show at least two app images');
  for(let index=0;index<2;index++){
   const img=images.nth(index);
   assert.equal(await img.getAttribute('loading'),'lazy');
   await img.evaluate(e=>e.decode());
   assert(await img.evaluate(e=>e.naturalWidth>0&&e.classList.contains('loaded')));
  }
  const src=await images.first().getAttribute('src');
  await page.locator('.app-open').first().click();
  const viewerImage=page.locator('.app-viewer-canvas img');
  await viewerImage.waitFor({state:'visible'});
  assert.equal(await viewerImage.getAttribute('loading'),'eager');
  await page.keyboard.press('Escape');
  const stalled=await browser.newPage();await catalogBase(stalled);let release, intercepted;
  const gate=new Promise(r=>release=r);
  const requestSeen=new Promise(r=>intercepted=r);
  await stalled.route(new URL(src,base).href,async route=>{intercepted();await gate;await route.fulfill({status:404,body:''})});
  await stalled.goto(base+'#apps',{waitUntil:'domcontentloaded'});
  const card=stalled.locator('.app-open').first();
  const stalledImage=card.locator('img');
  await stalledImage.waitFor();
  await requestSeen;
  assert.equal(await stalledImage.evaluate(e=>e.classList.contains('loaded')),false);
  assert.match(await card.locator('.pinmedia').evaluate(e=>getComputedStyle(e,'::after').content),/Loading image/);
  release();
  await card.locator('.media-unavailable').waitFor();
  console.log('PASS: catalog previews load lazily, viewer media loads eagerly, and stalled or failed images show explicit states');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
