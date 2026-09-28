const fs = require('node:fs/promises');
const path = require('node:path');

const siteRoot = path.resolve(__dirname, '../site');
const localOrigin = 'http://hugging-app.test';
const mimeTypes = {
  '.css':'text/css; charset=utf-8',
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.jpg':'image/jpeg',
  '.png':'image/png',
  '.svg':'image/svg+xml',
  '.woff2':'font/woff2'
};
const previewFixture = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="640"><rect width="320" height="640" fill="#7371d9"/></svg>');

async function catalogBase(page) {
  const configured = process.env.CATALOG_TEST_URL;
  if (configured) return configured.endsWith('/') ? configured : `${configured}/`;

  await page.route('https://is*-ssl.mzstatic.com/image/thumb/**/1290x2796bb.png', route => route.fulfill({status:200,body:previewFixture,contentType:'image/svg+xml'}));
  await page.route(`${localOrigin}/**`, async route => {
    try {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      const relative = pathname === '/' ? '/index.html' : pathname;
      if (/^\/assets\/[a-f0-9]+\.[a-z0-9]+$/i.test(relative)) {
        return route.fulfill({status:200, body:previewFixture, contentType:'image/svg+xml'});
      }
      const file = path.resolve(siteRoot, `.${relative}`);
      if (file !== siteRoot && !file.startsWith(`${siteRoot}${path.sep}`)) {
        return route.fulfill({status:403, body:'Blocked path'});
      }
      const body = await fs.readFile(file);
      return route.fulfill({status:200, body, contentType:mimeTypes[path.extname(file)] || 'application/octet-stream'});
    } catch {
      return route.fulfill({status:404, body:'Not found'});
    }
  });
  return `${localOrigin}/`;
}

module.exports = {catalogBase};
