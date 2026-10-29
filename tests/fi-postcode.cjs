// Run: node tests/fi-postcode.cjs. No network requests or external writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../fi/sahkosopimukset/comparison.js'), 'utf8');
class Element {
  constructor(value = '') { this.value = value; this.children = []; this.handlers = {}; this.hidden = false; this.disabled = false; }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  setAttribute() {}
  addEventListener(type, fn) { this.handlers[type] = fn; }
  querySelector() { return this.button ||= new Element(); }
  reportValidity() { return true; }
  setCustomValidity() {}
  focus() {}
}

function formHarness() {
  const elements = { consumption: new Element('5000'), postcode: new Element(), fuse: new Element('3x35') };
  const requests = [];
  let fail = false;
  const document = {
    getElementById: id => elements[id] ||= new Element(),
    createElement: () => new Element(),
  };
  vm.runInNewContext(source, {
    document, Intl, URL, URLSearchParams, AbortController,
    setTimeout: () => 1, clearTimeout() {},
    fetch: async value => {
      const url = new URL(value, 'https://elecz.com');
      requests.push(url);
      assert.equal(elements.postcode.disabled, true, 'postcode stays fixed while a request is pending');
      if (fail) throw new Error('offline');
      const postcode = url.searchParams.get('postcode');
      const offer = {
        provider: postcode ? 'Regional ' + postcode : 'National', product_name: 'Backend choice',
        annual_cost_estimate: 100, contract_terms_type: 'ongoing',
      };
      return { ok: true, json: async () => ({
        zone: 'FI', currency: 'EUR', contract_comparison: 'available',
        assumptions: { annual_consumption_kwh: 5000, main_fuse: '3x35', main_fuse_source: 'user_provided' },
        top_spot_offers: [offer], top_fixed_offers: [],
      }) };
    },
  });
  return {
    elements, requests,
    setFail(value) { fail = value; },
    async submit(value) {
      elements.postcode.value = value;
      await elements['comparison-form'].handlers.submit({ preventDefault() {} });
      assert.equal(elements.postcode.disabled, false, 'postcode is re-enabled after the request');
      return requests.at(-1);
    },
  };
}

async function testForm() {
  const h = formHarness();
  for (const [typed, expected] of [['00100', '00100'], [' 20100 ', '20100'], ['67100', '67100']]) {
    const url = await h.submit(typed);
    assert.equal(url.pathname, '/signal/contract');
    assert.equal(url.searchParams.get('postcode'), expected, 'leading zeros must survive');
    assert.equal(url.searchParams.get('zone'), 'FI');
    assert.equal(url.searchParams.get('consumption'), '5000');
    assert.equal(url.searchParams.get('fuse'), '3x35');
    assert.equal(h.elements['postcode-notice'].hidden, true);
    assert.equal(h.elements['postcode-notice'].textContent, '');
    assert.equal(h.elements['spot-offers'].children[0].children[0].textContent, 'Regional ' + expected);
  }
  // Every malformed value must take the same successful national-only path as an empty field.
  for (const typed of ['', '   ', '1234', '123456', 'FI-00100', '12a45', '００１００', '00100&zone=SE', '<script>']) {
    const url = await h.submit(typed);
    assert.equal(url.searchParams.has('postcode'), false, typed);
    assert.equal(url.searchParams.get('zone'), 'FI');
    assert.equal(h.elements.results.hidden, false, 'invalid postcodes must not block comparison');
    assert.equal(h.elements['postcode-notice'].hidden, false);
    assert.match(h.elements['postcode-notice'].textContent, /vain valtakunnalliset tarjoukset/);
    assert.match(h.elements['postcode-notice'].textContent, /Alueelliset tarjoukset eivät ole mukana/);
    assert.equal(h.elements['spot-offers'].children[0].children[0].textContent, 'National');
    assert.equal(h.elements.status.textContent, 'Vertailu valmis.');
  }
  // Repeated comparisons must clear the previous warning/results in both directions.
  await h.submit('00100');
  assert.equal(h.elements['postcode-notice'].hidden, true);
  assert.equal(h.elements['spot-offers'].children.length, 1);
  await h.submit('');
  assert.equal(h.elements['postcode-notice'].hidden, false);
  assert.equal(h.elements['spot-offers'].children.length, 1);

  h.setFail(true);
  await h.submit('00100');
  assert.equal(h.elements.status.className, 'error');
  assert.equal(h.elements.results.hidden, true, 'failed requests must not show stale regional results');

  const html = fs.readFileSync(path.join(__dirname, '../fi/sahkosopimukset/index.html'), 'utf8');
  const attributes = html.match(/<input\b[^>]*\bid="postcode"[^>]*>/)?.[0];
  assert(attributes, 'postcode field exists');
  assert.match(attributes, /type="text"/, 'a postcode is text, not a number');
  assert.match(attributes, /inputmode="numeric"/);
  assert.match(attributes, /autocomplete="postal-code"/);
  assert.match(html, /<label\b[^>]*for="postcode"/);
  assert.doesNotMatch(attributes, /\b(?:required|pattern|minlength|maxlength)\b/, 'invalid/long input must not block or truncate the national-only fallback');
}

async function testPostcodeCacheIsolation() {
  const workerSource = fs.readFileSync(path.join(__dirname, '../_worker.js'), 'utf8');
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(workerSource).toString('base64'))).default;
  const originalFetch = globalThis.fetch;
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const stored = new Map(), upstream = [];
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
    async match(request) { return stored.get(request.url)?.clone(); },
    async put(request, response) { stored.set(request.url, response.clone()); },
  } } });
  globalThis.fetch = async request => {
    const url = new URL(request.url);
    assert.equal(url.origin, 'https://elecz-api.onrender.com');
    upstream.push(url.href);
    return Response.json({ postcode: url.searchParams.get('postcode'), consumption: url.searchParams.get('consumption') });
  };
  const env = { ASSETS: { fetch() { throw new Error('comparison must reach Core'); } } };
  async function compare(query) {
    const pending = [];
    const response = await worker.fetch(new Request('https://elecz.com/signal/contract?' + query), env, {
      waitUntil(promise) { pending.push(promise); },
    });
    await Promise.all(pending);
    return response.json();
  }
  try {
    const prefix = 'zone=FI&consumption=5000';
    assert.equal((await compare(prefix + '&postcode=00100')).postcode, '00100');
    assert.equal((await compare(prefix + '&postcode=67100')).postcode, '67100');
    assert.equal((await compare(prefix)).postcode, null);
    assert.equal(upstream.length, 3, 'different postcodes and national-only results need distinct cache entries');
    assert.equal((await compare(prefix + '&postcode=00100')).postcode, '00100');
    assert.equal((await compare(prefix + '&postcode=67100')).postcode, '67100');
    assert.equal((await compare(prefix)).postcode, null);
    assert.equal(upstream.length, 3, 'cache hits must retain the correct postcode-specific response');
    const changed = await compare('zone=FI&consumption=2000&postcode=00100');
    assert.equal(changed.consumption, '2000');
    assert.equal(upstream.length, 4, 'consumption remains part of the cache key');
    await compare(prefix + '&postcode=00100&fuse=3x63');
    assert.equal(upstream.length, 5, 'fuse remains part of the cache key');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
    else delete globalThis.caches;
  }
}

(async () => {
  await testForm();
  await testPostcodeCacheIsolation();
  console.log('PASS: optional postcode, leading zeros, malformed/empty fallback, warning transitions, request failure, accessible input, postcode/consumption/fuse cache isolation');
})().catch(error => { console.error(error); process.exitCode = 1; });
