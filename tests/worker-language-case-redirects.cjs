// Run: node tests/worker-language-case-redirects.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../_worker.js'), 'utf8');
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  const assets = [];
  const env = { ASSETS: { fetch: async request => { assets.push(new URL(request.url).pathname); return new Response('asset'); } } };
  const get = target => worker.fetch(new Request('https://elecz.com' + target), env, {});

  for (const [from, to] of [
    ['/FI', '/fi/'], ['/FI/', '/fi/'], ['/Fi', '/fi/'], ['/SV', '/sv/'], ['/JA/', '/ja/'],
    ['/FI/Sahkosopimukset/', '/fi/sahkosopimukset/'], ['/FI?x=1', '/fi/?x=1'],
  ]) {
    const response = await get(from);
    assert.equal(response.status, 301, from);
    assert.equal(response.headers.get('Location'), 'https://elecz.com' + to, from);
  }
  assert.equal(assets.length, 0);

  // Lowercase language pages and paths that merely begin with the same letters are untouched.
  for (const target of ['/fi', '/fi/', '/fi/sahkosopimukset/', '/FIND', '/Docs/', '/BingSiteAuth.xml']) {
    const response = await get(target);
    assert.equal(response.status, 200, target);
  }
  console.log('worker-language-case-redirects: ok');
})().catch(error => { console.error(error); process.exit(1); });
