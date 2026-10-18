// Run: node tests/worker-go-redirects.cjs. Uses only a loopback HTTP server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

(async () => {
  const workerSource = fs.readFileSync(path.join(__dirname, '../_worker.js'), 'utf8');
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(workerSource).toString('base64'))).default;
  const realFetch = globalThis.fetch;
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  let goHits = 0, supplierHits = 0;
  let origin;
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/go/')) {
      goHits++;
      const unknown = request.url.includes('offer=unknown');
      response.writeHead(302, {
        Location: unknown ? origin + '/fi/sahkosopimukset/' : origin + '/supplier',
        'Cache-Control': 'public, max-age=86400',
        'X-Origin-Marker': 'render',
      });
      response.end();
    } else {
      supplierHits++;
      response.end('A Worker must not fetch the redirect destination.');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  try {
    // Any Cache API lookup/write during /go/ is a test failure.
    Object.defineProperty(globalThis, 'caches', { configurable: true, get() { throw Error('/go/ must bypass Cache API'); } });
    globalThis.fetch = async request => {
      const url = new URL(request.url);
      assert.equal(url.origin, 'https://elecz-api.onrender.com');
      assert.equal(request.redirect, 'manual');
      assert.equal(request.cache, 'no-store');
      assert.equal(request.headers.get('X-Test'), 'preserved');
      return realFetch(new Request(origin + url.pathname + url.search, request));
    };
    const env = { ASSETS: { fetch() { throw Error('/go/ must not fall through to assets'); } } };
    const ctx = { waitUntil() { throw Error('/go/ must not schedule cache writes'); } };
    for (const method of ['GET', 'GET', 'HEAD']) {
      const response = await worker.fetch(new Request('https://elecz.com/go/provider?zone=FI&offer=active&src=web', { method, headers: { 'X-Test': 'preserved' } }), env, ctx);
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('Location'), origin + '/supplier');
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
      assert.equal(response.headers.get('X-Origin-Marker'), 'render');
      assert.equal(await response.text(), '');
    }
    const unknown = await worker.fetch(new Request('https://elecz.com/go/provider?zone=FI&offer=unknown', { headers: { 'X-Test': 'preserved' } }), env, ctx);
    assert.equal(unknown.status, 302);
    assert.equal(unknown.headers.get('Location'), origin + '/fi/sahkosopimukset/');
    assert.equal(goHits, 4, 'each request must reach the origin');
    assert.equal(supplierHits, 0, 'redirect destinations must not be fetched by the Worker');

    // Non-/go/ proxy behavior remains unchanged.
    globalThis.fetch = async request => {
      assert.equal(request.url, 'https://elecz-api.onrender.com/mcp');
      assert.equal(request.redirect, 'follow');
      assert.equal(request.cache, 'default');
      return new Response('mcp', { status: 200 });
    };
    assert.equal(await (await worker.fetch(new Request('https://elecz.com/mcp'), env, ctx)).text(), 'mcp');

    const writes = [], pending = [];
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
      async match() { return undefined; }, async put(request, response) { writes.push([request.url, response.headers.get('Cache-Control')]); },
    } } });
    globalThis.fetch = async request => {
      assert.equal(request.url, 'https://elecz-api.onrender.com/signal/contract?zone=FI&consumption=5000');
      assert.equal(request.redirect, 'follow');
      assert.equal(request.cache, 'default');
      return Response.json({ zone: 'FI' });
    };
    const signal = await worker.fetch(new Request('https://elecz.com/signal/contract?zone=FI&consumption=5000'), env, { waitUntil(promise) { pending.push(promise); } });
    assert.equal((await signal.json()).zone, 'FI');
    await Promise.all(pending);
    assert.deepEqual(writes, [['https://elecz.com/signal/contract?zone=FI&consumption=5000', 'public, max-age=300']]);
    console.log('PASS: actual 302 preserved, no redirect destination fetched, GET/HEAD, repeated requests hit origin, no /go/ caching, fallback preserved, MCP and signal behavior unchanged');
  } finally {
    globalThis.fetch = realFetch;
    if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
    else delete globalThis.caches;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
