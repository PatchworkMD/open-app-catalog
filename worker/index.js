// Serves the catalog. Screenshot media lives in R2 (millions of bytes that the
// pipeline re-fetches from Apple daily); everything else is a static asset
// shipped with the Worker.
// @ts-check
import { isAssetPath } from '../site/snapshot.js';

/**
 * @typedef {{offset?:number, length?:number, suffix?:number}} R2Range
 * @typedef {{size:number, httpEtag:string, uploaded:Date, range?:R2Range, body?:ReadableStream|null, writeHttpMetadata(headers:Headers):void}} R2ObjectLike
 * @typedef {{get(key:string, options:{onlyIf:Headers, range?:Headers}):Promise<R2ObjectLike|null>}} MediaBucket
 * @typedef {{MEDIA:MediaBucket, ASSETS:{fetch(request:Request):Promise<Response>}}} Env
 */

const MEDIA_PREFIX = '/assets/';
const IMMUTABLE = 'public, max-age=31536000, immutable';

export default {
  /** @param {Request} request @param {Env} env */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(MEDIA_PREFIX)) return env.ASSETS.fetch(request);
    const headers = new Headers({ 'x-content-type-options': 'nosniff' });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      headers.set('allow', 'GET, HEAD');
      return new Response('Method not allowed', { status: 405, headers });
    }

    let key;
    try {
      key = decodeURIComponent(url.pathname.slice(1));
    } catch {
      return new Response('Not found', { status: 404, headers });
    }
    // Asset names are content hashes, so anything else is a probe.
    if (!isAssetPath(key)) {
      return new Response('Not found', { status: 404, headers });
    }

    const ifRange = request.headers.get('if-range');
    const wantsRange = request.method === 'GET' && request.headers.has('range');
    let object = await env.MEDIA.get(
      key,
      wantsRange ? { onlyIf: request.headers, range: request.headers } : { onlyIf: request.headers }
    );
    if (!object) return new Response('Not found', { status: 404, headers });

    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', IMMUTABLE);
    if (!headers.has('content-type')) headers.set('content-type', contentType(key));

    const rangeAllowed = wantsRange && ifRangeAllows(ifRange, object.httpEtag, object.uploaded);
    if (wantsRange && !rangeAllowed) {
      object = await env.MEDIA.get(key, { onlyIf: request.headers });
      if (!object) return new Response('Not found', { status: 404, headers });
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      if (!headers.has('content-type')) headers.set('content-type', contentType(key));
    }

    // onlyIf turns a cache revalidation into a body-less object.
    if (!('body' in object) || object.body === null) {
      const failedPrecondition =
        failedIfMatch(request.headers.get('if-match'), object.httpEtag) ||
        (!request.headers.has('if-match') &&
          failedIfUnmodifiedSince(request.headers.get('if-unmodified-since'), object.uploaded));
      return new Response(null, { status: failedPrecondition ? 412 : 304, headers });
    }
    if (rangeAllowed && object.range) {
      const { offset = 0, length = object.size - offset, suffix } = object.range;
      const rangeOffset = suffix === undefined ? offset : Math.max(0, object.size - suffix);
      const rangeLength = suffix === undefined ? length : Math.min(suffix, object.size);
      headers.set('content-range', `bytes ${rangeOffset}-${rangeOffset + rangeLength - 1}/${object.size}`);
      return new Response(object.body, { status: 206, headers });
    }
    headers.set('accept-ranges', 'bytes');
    return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
  },
};

/** @param {string|null} value @param {string} etag @param {Date} uploaded */
function ifRangeAllows(value, etag, uploaded) {
  if (!value || !etag) return !value;
  if (value.startsWith('W/')) return false;
  if (value.startsWith('"')) return value === etag;
  const date = Date.parse(value);
  return (
    Number.isFinite(date) &&
    uploaded instanceof Date &&
    Math.floor(uploaded.getTime() / 1000) <= Math.floor(date / 1000)
  );
}

/** @param {string|null} value @param {string} etag */
function failedIfMatch(value, etag) {
  if (!value) return false;
  return value.trim() !== '*' && !value.split(',').some(tag => tag.trim() === etag && !tag.trim().startsWith('W/'));
}

/** @param {string|null} value @param {Date} uploaded */
function failedIfUnmodifiedSince(value, uploaded) {
  if (!value || !(uploaded instanceof Date)) return false;
  const date = Date.parse(value);
  return Number.isFinite(date) && Math.floor(uploaded.getTime() / 1000) > Math.floor(date / 1000);
}

/** @param {string} key */
function contentType(key) {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  return (
    { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext] || 'application/octet-stream'
  );
}
