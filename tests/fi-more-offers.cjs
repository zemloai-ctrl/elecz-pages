// Run: node --test tests/fi-more-offers.cjs
// Real Core response: QUERY='consumption=6000' node tests/fi-more-offers.cjs --core-response < response.json
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../fi/sahkosopimukset/comparison.js'), 'utf8');
const clone = data => JSON.parse(JSON.stringify(data));

function payload(spot = 25, fixed = 27) {
  const data = { zone: 'FI', currency: 'EUR', contract_comparison: 'available',
    assumptions: { annual_consumption_kwh: 2000, consumption_source: 'zone_default' },
    comparison_list_status: 'available', comparison_offers: {}, comparison_list_meta: { limit_per_group: 20 } };
  for (const [model, total] of [['spot', spot], ['fixed', fixed]]) {
    const rows = Array.from({ length: Math.min(total, 20) }, (_, i) => ({
      provider: 'Same supplier', product_name: `${model} campaign ${i}`, type: model,
      id: `${model}-${i}`, go_url: `https://elecz.com/go/FI_EV_1?zone=FI&offer_id=${model}-${i}`,
      annual_cost_estimate: (model === 'spot' ? 100 : 200) + i,
      basic_fee_eur_month: 4.95, contract_terms_type: 'ongoing',
      price_includes_tax: true, direct_url: `https://supplier.example/${model}-${i}`,
    }));
    data.comparison_offers[model] = rows;
    data[`top_${model}_offers`] = clone(rows.slice(0, 3));
    data.comparison_list_meta[model] = { returned_count: rows.length, total_count: total, truncated: total > rows.length };
  }
  return data;
}

function harness(initial = payload()) {
  let next = initial, failure = false, delayed = null;
  const elements = {}, requests = [];
  const document = { activeElement: null,
    getElementById(id) { return elements[id] ||= new Element('div'); },
    createElement(tag) { return new Element(tag); },
  };
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.handlers = {}; this.value = ''; this.hidden = true; this.disabled = false; this.step = '1000'; this.validation = ''; }
    append(...items) { this.children.push(...items); }
    replaceChildren() { this.children = []; }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    querySelector() { return this.button ||= new Element('button'); }
    setCustomValidity(message) { this.validation = message; }
    reportValidity() { return !this.validation; }
    focus() { document.activeElement = this; }
  }
  vm.runInNewContext(source, { document, Intl, URL, URLSearchParams, AbortController,
    setTimeout: () => 1, clearTimeout() {},
    fetch: async target => {
      requests.push(new URL(target, 'https://elecz.com'));
      if (delayed) await delayed;
      if (failure) throw new Error('offline');
      return { ok: true, json: async () => clone(next) };
    },
  });
  return { elements, requests, document,
    setResponse(data) { next = data; },
    fail() { failure = true; },
    defer() { return new Promise(resolve => { delayed = new Promise(done => resolve(() => { delayed = null; done(); })); }); },
    submit() { return elements['comparison-form'].handlers.submit({ preventDefault() {} }); },
    open(model) { const button = elements[`${model}-more`]; if (!button.hidden && !button.disabled) button.onclick(); },
    configure(query) {
      const params = new URLSearchParams(query);
      if (params.has('housing_profile')) {
        elements['housing-profile'].value = params.get('housing_profile');
        elements['housing-profile'].handlers.change();
      }
      if (params.has('consumption')) { elements.consumption.value = params.get('consumption'); elements.consumption.handlers.input(); }
      if (params.has('postcode')) elements.postcode.value = params.get('postcode');
      if (params.has('fuse')) elements.fuse.value = params.get('fuse');
    },
  };
}

const cards = (h, model) => h.elements[`${model}-offers`].children.filter(x => x.className === 'offer');
const count = (h, model) => h.elements[`${model}-count`].textContent.replace(/\s/g, ' ');
async function proveExpansion(data, query = '') {
  const h = harness(data); h.configure(query); await h.submit();
  assert.equal(h.elements.results.hidden, false);
  assert.equal(h.elements.status.className, '');
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].searchParams.get('offer_limit'), '20');
  for (const model of ['spot', 'fixed']) {
    const rows = data.comparison_offers[model];
    assert.equal(cards(h, model).length, Math.min(3, rows.length));
    assert.equal(h.elements[`${model}-more`].hidden, rows.length <= 3);
    h.open(model);
    assert.equal(cards(h, model).length, rows.length);
    if (rows.length > 3) {
      assert.equal(h.document.activeElement, cards(h, model)[3].children[0]);
      assert.equal(h.document.activeElement.tagName, 'h3');
      assert.equal(h.document.activeElement.tabIndex, -1);
    }
    assert.equal(h.elements[`${model}-more`].hidden, true);
    rows.forEach((row, i) => {
      const card = cards(h, model)[i];
      assert.equal(card.children[1].textContent, row.product_name);
      if (row.go_url) assert.equal(card.children.at(-1).href, row.go_url + '&src=web');
    });
  }
  assert.equal(h.requests.length, 1, 'opening both groups never fetches again');
  return h;
}

if (process.argv.includes('--core-response')) {
  const data = JSON.parse(fs.readFileSync(0, 'utf8'));
  test('actual Core response renders top three and opens both full lists without another request', async () => {
    const h = await proveExpansion(data, process.env.QUERY || '');
    for (const model of ['spot', 'fixed']) {
      const meta = data.comparison_list_meta[model];
      assert.equal(count(h, model), meta.truncated
        ? `Näytetään ${meta.returned_count} halvinta ${meta.total_count} tarjouksesta`
        : `Yhteensä ${meta.total_count} ${meta.total_count === 1 ? 'tarjous' : 'tarjousta'}`);
    }
  });
} else {
  test('initial top three, independent buttons, full expansion, focus, live status and one network request', async () => {
    const h = harness(); await h.submit();
    assert.equal(count(h, 'spot'), 'Näytetään 3 halvinta 25 tarjouksesta');
    const first = cards(h, 'spot')[0];
    h.open('spot');
    assert.equal(cards(h, 'spot').length, 20);
    assert.equal(cards(h, 'spot')[0], first, 'existing cards are retained');
    assert.equal(cards(h, 'fixed').length, 3);
    assert.equal(count(h, 'spot'), 'Näytetään 20 halvinta 25 tarjouksesta');
    assert.equal(h.document.activeElement, cards(h, 'spot')[3].children[0]);
    assert.match(h.elements['spot-more-status'].textContent, /17 lisätarjousta/);
    assert.equal(h.elements['spot-more']['aria-expanded'], 'true');
    assert.equal(h.elements['fixed-more'].hidden, false);
    h.open('spot'); assert.equal(cards(h, 'spot').length, 20, 'cannot append twice');
    h.open('fixed'); assert.equal(cards(h, 'fixed').length, 20);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].search, '?zone=FI&offer_limit=20');
  });
  for (const model of ['spot', 'fixed']) for (const total of [0, 1, 2, 3, 4, 12, 19, 20, 21, 137]) {
    test(`${model}: ${total} eligible priced offers, truthful count and button visibility`, async () => {
      const group = payload(model === 'spot' ? total : 25, model === 'fixed' ? total : 27);
      const h = await proveExpansion(group);
      assert.equal(count(h, model), total > 20 ? `Näytetään 20 halvinta ${total} tarjouksesta`
        : `Yhteensä ${total} ${total === 1 ? 'tarjous' : 'tarjousta'}`);
      if (!total) assert.match(h.elements[`${model}-offers`].children[0].textContent, /ei löytynyt/);
    });
  }
  const mutations = {
    missing: d => { delete d.comparison_offers; },
    unavailable: d => { d.comparison_list_status = 'unavailable'; d.comparison_offers = d.comparison_list_meta = null; },
    'missing status': d => { delete d.comparison_list_status; },
    'missing metadata': d => { delete d.comparison_list_meta; },
    'wrong limit': d => { d.comparison_list_meta.limit_per_group = 50; },
    'wrong count': d => { d.comparison_list_meta.spot.returned_count = 19; },
    'boolean count': d => { d.comparison_list_meta.spot.total_count = true; },
    'negative total': d => { d.comparison_list_meta.spot.total_count = -1; },
    'wrong truncation': d => { d.comparison_list_meta.fixed.truncated = false; },
    'partial list': d => { d.comparison_offers.spot.pop(); d.comparison_list_meta.spot.returned_count--; },
    'too many': d => { d.comparison_offers.spot.push(d.comparison_offers.spot[19]); },
    'wrong prefix': d => { d.comparison_offers.spot[0].product_name = 'other'; },
    'wrong order': d => { d.comparison_offers.spot[3].annual_cost_estimate = 1; },
    'bad price': d => { d.comparison_offers.spot[3].annual_cost_estimate = '103'; },
    'wrong group': d => { d.comparison_offers.spot[3].type = 'hybrid'; },
    'missing group': d => { delete d.comparison_offers.fixed; },
    'bad row': d => { d.comparison_offers.spot[3] = null; },
    'duplicate identity': d => { d.comparison_offers.spot[3].id = d.comparison_offers.spot[2].id; },
    'wrong canonical link': d => { d.comparison_offers.spot[3].go_url = d.comparison_offers.spot[2].go_url; },
    'external canonical link': d => { d.comparison_offers.spot[3].go_url = 'https://other.example/go/'; },
    'credentials in link': d => { d.comparison_offers.spot[3].go_url = 'https://u:p@elecz.com/go/x?zone=FI&offer_id=spot-3'; },
  };
  for (const [name, mutate] of Object.entries(mutations)) test(`optional failure preserves top three: ${name}`, async () => {
    const data = payload(); mutate(data); const h = harness(data); await h.submit();
    assert.equal(h.elements.results.hidden, false);
    assert.equal(h.elements.status.className, '');
    for (const model of ['spot', 'fixed']) {
      assert.equal(cards(h, model).length, 3);
      assert.equal(h.elements[`${model}-more`].hidden, true);
      assert.equal(h.elements[`${model}-more-note`].hidden, false);
      assert.equal(h.elements[`${model}-more-note`].textContent, 'Lisätarjouksia ei juuri nyt saatavilla');
      assert.equal(h.elements[`${model}-count`].hidden, true);
    }
    assert.equal(h.requests.length, 1);
  });
  test('new comparison resets both lists and handlers before the request finishes', async () => {
    const h = harness(); await h.submit(); h.open('spot'); h.open('fixed');
    const release = await h.defer(); const pending = h.submit();
    for (const model of ['spot', 'fixed']) {
      assert.equal(cards(h, model).length, 0);
      assert.equal(h.elements[`${model}-more`].hidden, true);
      assert.equal(h.elements[`${model}-more`].onclick, null);
      assert.equal(h.elements[`${model}-more`]['aria-expanded'], 'false');
    }
    release(); await pending;
    assert.equal(cards(h, 'spot').length, 3); assert.equal(cards(h, 'fixed').length, 3);
    h.open('spot'); assert.equal(cards(h, 'spot').length, 20);
    assert.equal(h.requests.length, 2);
  });
  test('unavailable response after expansion clears old counts, cards and handlers', async () => {
    const h = harness(); await h.submit(); h.open('spot');
    const data = payload(); mutations.unavailable(data); h.setResponse(data); await h.submit();
    assert.equal(cards(h, 'spot').length, 3);
    assert.equal(count(h, 'spot'), '');
    assert.equal(h.elements['spot-more'].onclick, null);
    assert.equal(h.elements['spot-more-note'].hidden, false);
    h.setResponse(payload(4, 3)); await h.submit(); h.open('spot');
    assert.equal(cards(h, 'spot').length, 4);
    assert.equal(h.elements['spot-more-note'].hidden, true);
    assert.match(h.elements['spot-more-status'].textContent, /1 lisätarjous\./);
  });
  test('network failure after expansion hides and clears previous results', async () => {
    const h = harness(); await h.submit(); h.open('spot'); h.fail(); await h.submit();
    assert.equal(h.elements.results.hidden, true);
    assert.equal(h.elements.status.className, 'error');
    assert.equal(cards(h, 'spot').length, 0);
    assert.equal(h.elements['spot-more'].onclick, null);
  });
  test('equal prices, same supplier products and object-key order retain server order', async () => {
    const data = payload(4, 3);
    data.comparison_offers.spot.forEach(row => { row.annual_cost_estimate = 0; });
    data.top_spot_offers = data.comparison_offers.spot.slice(0, 3).map(row => Object.fromEntries(Object.entries(row).reverse()));
    const h = await proveExpansion(data);
    assert.deepEqual(cards(h, 'spot').map(x => x.children[1].textContent), ['spot campaign 0', 'spot campaign 1', 'spot campaign 2', 'spot campaign 3']);
  });
  test('extra card uses direct link when canonical identity is unavailable', async () => {
    const data = payload(4, 3), row = data.comparison_offers.spot[3]; row.id = row.go_url = null;
    const h = await proveExpansion(data);
    assert.equal(cards(h, 'spot')[3].children.at(-1).href, row.direct_url);
  });
  test('buttons have distinct accessible names, list controls, status and native button semantics', () => {
    const html = fs.readFileSync(path.join(__dirname, '../fi/sahkosopimukset/index.html'), 'utf8');
    for (const model of ['spot', 'fixed']) {
      const button = html.match(new RegExp(`<button[^>]*id="${model}-more"[^>]*>`))[0];
      assert.match(button, /type="button"/); assert.match(button, /hidden/);
      assert.match(button, new RegExp(`aria-controls="${model}-offers"`));
      assert.match(button, /aria-expanded="false"/);
      assert.match(html, new RegExp(`id="${model}-more-status"[^>]*role="status"[^>]*aria-live="polite"`));
    }
    assert.match(html, /aria-label="Näytä lisää pörssisähkötarjouksia"/);
    assert.match(html, /aria-label="Näytä lisää kiinteähintaisia tarjouksia"/);
  });
}
