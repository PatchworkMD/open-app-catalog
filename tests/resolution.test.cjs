const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const page = await browser.newPage({viewport:{width:1200,height:1000},deviceScaleFactor:2});
  const base = process.env.CATALOG_TEST_URL || 'http://127.0.0.1:8791/';
  try {
    const preview = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nWQAAAAASUVORK5CYII=','base64');
    await page.route('**/assets/**',r=>r.fulfill({contentType:'image/png',body:preview}));
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
    assert(await img.evaluate(i=>i.naturalWidth>=1000&&i.naturalHeight>=2000));
    await page.screenshot({path:'/tmp/hugging-sharp-viewer.png',animations:'disabled'});
    await page.route('https://*-ssl.mzstatic.com/**',r=>r.abort());
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('.screen-canvas img')?.currentSrc.includes('/assets/'));
    await img.evaluate(i=>i.decode());
    assert(await img.evaluate(i=>i.naturalWidth>0));
    console.log('PASS: full-resolution Threads screenshots and fallback display (R2 preview mocked)',dimensions.width,dimensions.height);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
