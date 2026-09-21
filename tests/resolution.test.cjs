const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const page = await browser.newPage({viewport:{width:1200,height:1000},deviceScaleFactor:2});
  const base = process.env.CATALOG_TEST_URL || 'http://127.0.0.1:8791/';
  try {
    if(process.env.CATALOG_SNAPSHOT) await page.route('**/data.json', r => r.fulfill({contentType:'application/json',body:fs.readFileSync(process.env.CATALOG_SNAPSHOT,'utf8')}));
    await page.goto(base+'#flows');
    await page.getByRole('button',{name:'Open Community and discovery'}).click();
    const img = page.locator('.screen-canvas img');
    await img.evaluate(i=>i.decode());
    const dimensions = await img.evaluate(i=>({width:i.naturalWidth,height:i.naturalHeight,url:i.currentSrc}));
    assert(dimensions.width >= 1000,JSON.stringify(dimensions));
    assert(dimensions.height >= 2000,JSON.stringify(dimensions));
    assert.match(dimensions.url,/1290x2796bb\.png$/);
    await page.keyboard.press('ArrowRight');
    await img.evaluate(i=>i.decode());
    assert(await img.evaluate(i=>i.naturalWidth>=1000));
    await page.screenshot({path:'/tmp/hugging-sharp-viewer.png',animations:'disabled'});
    await page.route('https://*-ssl.mzstatic.com/**',r=>r.abort());
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('.screen-canvas img')?.currentSrc.includes('/assets/'));
    await img.evaluate(i=>i.decode());
    assert(await img.evaluate(i=>i.naturalWidth>0));
    console.log('PASS: full-resolution Threads screenshots and cached fallback',dimensions.width,dimensions.height);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
