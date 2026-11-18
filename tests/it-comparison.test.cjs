const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const script = readFileSync(join(__dirname, '../it/confronto/comparison.js'), 'utf8');
const identity = '0ddd00a4-7624-4b0d-a4b7-a48fda07ecbd';
const goUrl = `https://elecz.com/go/IT_01234567890?zone=IT&offer_id=${identity}`;
const originalLink = { kind: 'offer_page', url: 'https://seller.example/offer' };
const fixed = { name: 'Prima', provider: 'Venditore', contract_type: 'fixed', annual_supply_cost_eur: 480 };
const disclosure = 'Il link porta alla home page del venditore.';

function element(tag) {
  return {
    tag, children: [], textContent: '',
    append(...children) { this.children.push(...children); },
    get childElementCount() { return this.children.length; },
  };
}

function comparison() {
  const result = element('div');
  const elements = {
    '#comparison-form': { addEventListener() {} },
    '#comparison-status': element('p'),
    '#comparison-result': result,
  };
  const context = vm.createContext({
    URL, URLSearchParams,
    document: { querySelector: selector => elements[selector], createElement: element },
  });
  vm.runInContext(script, context);
  return { result, card: context.offerCard, render: context.render };
}

test('fixed list follows API order whether or not a row has an affiliate link', () => {
  const second = { ...fixed, name: 'Seconda' };
  for (const first of [fixed, { ...fixed, elecz_offer_id: identity, link_target: 'offer', go_url: goUrl }]) {
    const { result, render } = comparison();
    render({
      contract_comparison: 'available', comparison_state: 'insufficient_data',
      market: 'IT', cost_scope: 'electricity_sales_only', offers: [second, first],
    }, 2417);
    const grid = result.children.find(node => node.className === 'offers');
    assert.deepEqual(grid.children.map(card => card.children.find(node => node.tag === 'h4').textContent),
                     ['Seconda', 'Prima']);
  }
});

test('supplier homepage notice comes before the sponsored CTA on either card type', () => {
  const { card } = comparison();
  const href = goUrl + '&link_target=supplier_home';
  for (const offer of [fixed, {
    ...fixed, contract_type: 'pun_indexed', annual_supply_cost_eur: { min: 360, max: 610 },
  }]) {
    const rendered = card({
      ...offer, link: originalLink, elecz_offer_id: identity, go_url: href,
      link_target: 'supplier_home', link_disclosure: disclosure,
    });
    const beforeAction = rendered.children.at(-2);
    const [anchor] = rendered.children.at(-1).children;
    assert.equal(beforeAction.textContent, disclosure);
    assert.equal(anchor.href, href);
    assert.ok(anchor.rel.includes('sponsored'));
  }
});

test('missing or invalid execution metadata preserves the original ARERA action', () => {
  const { card } = comparison();
  for (const metadata of [
    {},
    { elecz_offer_id: identity, go_url: goUrl.replace('elecz.com', 'outside.example'), link_target: 'offer' },
    { elecz_offer_id: identity, go_url: goUrl + '&link_target=supplier_home', link_target: 'supplier_home' },
    { elecz_offer_id: identity, go_url: goUrl + '&offer_id=other', link_target: 'offer' },
  ]) {
    const rendered = card({ ...fixed, link: originalLink, ...metadata });
    const [anchor] = rendered.children.at(-1).children;
    assert.equal(anchor.href, originalLink.url);
    assert.equal(anchor.textContent, 'Pagina dell’offerta');
    assert.equal(anchor.rel, 'noopener noreferrer nofollow');
  }
});
