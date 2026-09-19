const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:8765/#apps');
  await page.locator('.app-open').first().waitFor();
  for(const name of ['WeChat','Garmin Messenger™']){
   const img=page.getByRole('button',{name:'Open '+name,exact:true}).locator('img');
   assert.equal(await img.getAttribute('loading'),'eager');
   await img.evaluate(e=>e.decode());
   assert(await img.evaluate(e=>e.naturalWidth>0&&e.classList.contains('loaded')));
  }
  const src=await page.getByRole('button',{name:'Open WeChat',exact:true}).locator('img').getAttribute('src');
  const stalled=await browser.newPage();let release;
  const gate=new Promise(r=>release=r);
  await stalled.route('**/'+src,async route=>{await gate;await route.fulfill({status:404,body:''})});
  await stalled.goto('http://127.0.0.1:8765/#apps',{waitUntil:'domcontentloaded'});
  const card=stalled.getByRole('button',{name:'Open WeChat',exact:true});
  await card.waitFor();
  assert.match(await card.locator('.pinmedia').evaluate(e=>getComputedStyle(e,'::after').content),/Loading image/);
  release();
  await card.getByText('Image unavailable',{exact:true}).waitFor();
  console.log('PASS: reported blank cards decode eagerly; stalled and failed images show explicit states');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
