const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {catalogBase} = require('./browser-fixture.cjs');
(async () => {
  const browser = await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  const page = await browser.newPage({viewport:{width:1200,height:1000},deviceScaleFactor:2});
  const base = await catalogBase(page);
  try {
    const snapshot=JSON.parse(fs.readFileSync(process.env.CATALOG_SNAPSHOT || 'site/data.json','utf8'));
    const curation=JSON.parse(fs.readFileSync('site/curation.json','utf8'));
    const screenIds=[...snapshot.screens,...(curation.screens||[])].map(screen=>screen.id);
    const sources=Object.fromEntries(screenIds.map(id=>[id,`https://is1-ssl.mzstatic.com/image/thumb/${id}/1290x2796bb.png`]));
    await page.route('**/image-sources.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(sources)}));
    await page.route(url=>url.hostname.endsWith('-ssl.mzstatic.com'),r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1290" height="2796"><rect width="1290" height="2796" fill="#101010"/></svg>'}));
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
    await page.route(url=>url.hostname.endsWith('-ssl.mzstatic.com'),r=>r.abort());
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('.screen-canvas img')?.currentSrc.includes('/assets/'));
    await img.evaluate(i=>i.decode());
    assert(await img.evaluate(i=>i.naturalWidth>0));
    console.log('PASS: full-resolution Threads screenshots and cached fallback',dimensions.width,dimensions.height);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
