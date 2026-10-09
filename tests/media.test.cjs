const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {catalogBase}=require('./browser-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 try{
  const page=await browser.newPage();
  const base=await catalogBase(page);
  await page.goto(base+'#apps');
  await page.locator('.app-open').first().waitFor();
  for(const name of ['WeChat','Garmin Messenger™']){
   await page.locator('#search').fill(name);
   const img=page.getByRole('button',{name:'Open '+name,exact:true}).locator('img');
   assert.equal(await img.getAttribute('loading'),'eager');
   await img.evaluate(e=>e.decode());
   assert(await img.evaluate(e=>e.naturalWidth>0));
   assert.equal(await img.evaluate(e=>e.classList.contains('loaded')),true);
  }
  await page.locator('#search').fill('WeChat');
  const src=await page.getByRole('button',{name:'Open WeChat',exact:true}).locator('img').getAttribute('src');
  const stalled=await browser.newPage();await catalogBase(stalled);let release;
  const gate=new Promise(r=>release=r);
  await stalled.route('**/'+src,async route=>{await gate;await route.fulfill({status:404,body:''})});
  await stalled.goto(base+'#apps',{waitUntil:'domcontentloaded'});
  await stalled.locator('#search').fill('WeChat');
  const card=stalled.getByRole('button',{name:'Open WeChat',exact:true});
  await card.waitFor();
  await stalled.waitForFunction(() => {
   const media=document.querySelector('.app-open[aria-label="Open WeChat"] .pinmedia');
   return media&&getComputedStyle(media,'::after').content.includes('Loading image');
  });
  release();
  await card.getByText('Image unavailable',{exact:true}).waitFor();
  console.log('PASS: reported blank cards decode eagerly; stalled and failed images show explicit states');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
