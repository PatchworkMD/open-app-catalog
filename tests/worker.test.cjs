const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../worker/index.js'), 'utf8');
const worker = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const key = `assets/${'a'.repeat(64)}.jpg`;
const modified = new Date('2026-09-30T12:00:00Z');

function object(overrides = {}) {
  return {
    body: Buffer.from('0123456789'), size: 10, httpEtag: '"catalog-etag"', uploaded: modified,
    writeHttpMetadata(headers) {
      headers.set('content-type', 'image/jpeg');
      headers.set('last-modified', modified.toUTCString());
    },
    ...overrides,
  };
}

async function serve({method = 'GET', path = `/${key}`, headers = {}, rangeResult, bodyless = false} = {}) {
  const gets = [];
  const bucket = {async get(k, options) {
    gets.push({key:k, options});
    const value = object({body: bodyless ? null : Buffer.from('0123456789'), ...(rangeResult ? {range:rangeResult} : {})});
    return value;
  }};
  const [{default: handler}] = await Promise.all([worker]);
  const response = await handler.fetch(new Request(`https://catalog.test${path}`, {method, headers}), {MEDIA:bucket, ASSETS:{fetch(){throw Error('unexpected asset request')}}});
  return {response, gets};
}

test('media responses set nosniff and malformed escapes return 404', async () => {
  const {response:ok} = await serve();
  const {response:bad} = await serve({path:'/assets/%ZZ'});
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(bad.status, 404);
  assert.equal(bad.headers.get('x-content-type-options'), 'nosniff');
});

test('media method errors advertise supported methods', async () => {
  const {response} = await serve({method:'POST'});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('failed If-Match and If-Unmodified-Since return 412', async () => {
  const {response:tag} = await serve({headers:{'if-match':'"other"'}, bodyless:true});
  const {response:date} = await serve({headers:{'if-unmodified-since':'Wed, 30 Sep 2026 11:00:00 GMT'}, bodyless:true});
  assert.equal(tag.status, 412);
  assert.equal(date.status, 412);
});

test('cache validators return 304', async () => {
  const {response:tag} = await serve({headers:{'if-none-match':'"catalog-etag"'}, bodyless:true});
  const {response:date} = await serve({headers:{'if-modified-since':modified.toUTCString()}, bodyless:true});
  assert.equal(tag.status, 304);
  assert.equal(date.status, 304);
});

test('suffix ranges report the matching byte interval', async () => {
  const {response} = await serve({headers:{range:'bytes=-3'}, rangeResult:{suffix:3}});
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 7-9/10');
});

test('If-Range mismatch serves the full object; match keeps the range', async () => {
  const mismatch = await serve({headers:{range:'bytes=0-2','if-range':'"old"'}, rangeResult:{offset:0,length:3}});
  assert.equal(mismatch.response.status, 200);
  assert.equal(mismatch.response.headers.get('content-range'), null);
  const match = await serve({headers:{range:'bytes=0-2','if-range':'"catalog-etag"'}, rangeResult:{offset:0,length:3}});
  assert.equal(match.response.status, 206);
});

test('HEAD ignores Range and returns no body', async () => {
  const {response, gets} = await serve({method:'HEAD', headers:{range:'bytes=0-2'}, rangeResult:{offset:0,length:3}});
  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.equal('range' in gets[0].options, false);
});
