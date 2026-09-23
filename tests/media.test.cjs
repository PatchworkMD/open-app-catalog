const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const base=process.env.CATALOG_TEST_URL||'http://127.0.0.1:8791/';
  const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nWQAAAAASUVORK5CYII=','base64');
  const page=await browser.newPage();
  await page.route('**/assets/**',route=>route.fulfill({status:200,contentType:'image/png',body:pixel}));
  await page.route('https://*-ssl.mzstatic.com/**',route=>route.fulfill({status:200,contentType:'image/png',body:pixel}));
  await page.goto(base+'#apps');
  const images=page.locator('.app-open img:not(.icon)');
  await images.first().waitFor();
  assert((await images.count())>=2);
  for(const img of [images.nth(0),images.nth(1)]){
   assert.equal(await img.getAttribute('loading'),'eager');
   await img.evaluate(e=>e.decode());
   assert(await img.evaluate(e=>e.naturalWidth>0&&e.classList.contains('loaded')));
  }

  const src=await images.first().getAttribute('src');
  const assetPath=new URL(src,base).pathname;
  const stalled=await browser.newPage();let release;
  const gate=new Promise(r=>release=r);
  await stalled.route('**/assets/**',async route=>{
   if(new URL(route.request().url()).pathname===assetPath){await gate;await route.fulfill({status:404,body:''});}
   else await route.fulfill({status:200,contentType:'image/png',body:pixel});
  });
  await stalled.route('https://*-ssl.mzstatic.com/**',route=>route.fulfill({status:200,contentType:'image/png',body:pixel}));
  await stalled.goto(base+'#apps',{waitUntil:'domcontentloaded'});
  const first=stalled.locator('.app-open').first();
  await first.locator('img:not(.icon)').waitFor();
  await stalled.waitForFunction(() => {
   const media=document.querySelector('.app-open .pinmedia');
   return media&&getComputedStyle(media,'::after').content.includes('Loading image');
  });
  release();
  await first.locator('.media-unavailable').waitFor();
  console.log('PASS: current chart images decode eagerly; stalled loads and failed assets show clear states');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
