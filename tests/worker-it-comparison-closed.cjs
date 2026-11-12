const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../_worker.js'));
  const { default: worker } = await import('data:text/javascript;base64,' + source.toString('base64'));
  const env = { ASSETS: { fetch: () => new Response('asset') } };
  for (const [method, target] of [
    ['GET', '/it/confronto'], ['GET', '/it/confronto/'],
    ['GET', '/it/confronto/index.html'], ['HEAD', '/IT/Confronto/comparison.js'],
    ['GET', '/it/%63onfronto/comparison.css'], ['POST', '/it/confronto/api'],
  ]) {
    const response = await worker.fetch(new Request('https://elecz.com' + target, { method }), env, {});
    assert.equal(response.status, 404, method + ' ' + target);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  const italy = await worker.fetch(new Request('https://elecz.com/it/'), env, {});
  assert.equal(italy.status, 200);
  console.log('Italian comparison is closed');
})().catch(error => { console.error(error); process.exitCode = 1; });
