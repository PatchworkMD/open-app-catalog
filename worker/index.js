// Serves the catalog. Screenshot media lives in R2 (millions of bytes that the
// pipeline re-fetches from Apple daily); everything else is a static asset
// shipped with the Worker.
const MEDIA_PREFIX = '/assets/';
const IMMUTABLE = 'public, max-age=31536000, immutable';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(MEDIA_PREFIX)) return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const key = decodeURIComponent(url.pathname.slice(1));
    // Asset names are content hashes, so anything else is a probe.
    if (!/^assets\/[a-f0-9]{64}\.[a-z0-9]{2,4}$/i.test(key)) {
      return new Response('Not found', { status: 404 });
    }

    const wantsRange = request.headers.has('range');
    const object = await env.MEDIA.get(key, wantsRange
      ? { onlyIf: request.headers, range: request.headers }
      : { onlyIf: request.headers });
    if (!object) return new Response('Not found', { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', IMMUTABLE);
    if (!headers.has('content-type')) headers.set('content-type', contentType(key));

    // onlyIf turns a cache revalidation into a body-less object.
    if (!('body' in object) || object.body === null) {
      return new Response(null, { status: 304, headers });
    }
    if (wantsRange && object.range) {
      const { offset = 0, length = object.size - offset } = object.range;
      headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
      return new Response(object.body, { status: 206, headers });
    }
    headers.set('accept-ranges', 'bytes');
    return new Response(object.body, { status: 200, headers });
  },
};

function contentType(key) {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext]
    || 'application/octet-stream';
}
