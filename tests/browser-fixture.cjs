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

async function catalogBase(page) {
  const configured = process.env.CATALOG_TEST_URL;
  if (configured) return configured.endsWith('/') ? configured : `${configured}/`;

  await page.route(`${localOrigin}/**`, async route => {
    try {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      const relative = pathname === '/' ? '/index.html' : pathname;
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
