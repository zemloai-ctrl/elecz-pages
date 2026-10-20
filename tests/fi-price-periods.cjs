// Run: node tests/fi-price-periods.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
class Element {
  constructor() { this.children=[]; this.handlers={}; this.value='5000'; }
  append(...x) { this.children.push(...x); }
  replaceChildren() { this.children=[]; }
  setAttribute() {}
  addEventListener(type,fn) { this.handlers[type]=fn; }
  querySelector() { return this.button ||= new Element(); }
  reportValidity() { return true; }
  setCustomValidity() {}
  focus() {}
}
function offer(name, periods) {
  return {provider:name,product_name:name,annual_cost_estimate:200,
    contract_terms_type:'ongoing',price_periods:periods};
}
const fee=(amount,from,to,dates={})=>({component:'fixed_fee',amount,unit:'PER_MONTH',currency:'EUR',
  valid_from_contract_month:from,valid_until_contract_month:to,...dates});
async function run(offers) {
  const elements={};
  const document={getElementById:id=>elements[id] ||=new Element(),createElement:()=>new Element()};
  const data={zone:'FI',currency:'EUR',contract_comparison:'available',
    assumptions:{annual_consumption_kwh:5000},top_spot_offers:offers,top_fixed_offers:[]};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../fi/sahkosopimukset/comparison.js'),'utf8'),{
    document,Intl,URL,URLSearchParams,AbortController,setTimeout:()=>1,clearTimeout:()=>{},
    fetch:async()=>({ok:true,json:async()=>data})
  });
  await elements['comparison-form'].handlers.submit({preventDefault(){}});
  return elements['spot-offers'].children.map(card=>card.children.find(x=>x.children.some(y=>y.children.length))
    .children.map(row=>row.children.map(x=>x.textContent)));
}
(async()=>{
  const cards=await run([
    offer('Cheap Energy',[fee(0,1,3),fee(4.65,4,null)]),
    offer('Aalto Huoleton',[fee(0,1,1),fee(5.95,2,null)]),
    offer('Vattenfall',[fee(2.97,1,12),fee(5.95,13,null)]),
    offer('Tyrsky',[fee(0,null,null,{valid_until:'2026-12-31T00:00:00+00:00'}),
      fee(2.53,null,null,{valid_from:'2027-01-01T00:00:00+00:00'})])
  ]);
  assert(cards[0].some(r=>r[0]==='Kuukausimaksu' && r[1]==='0,00 €/kk ensimmäiset 3 kk, sen jälkeen 4,65 €/kk'));
  assert(cards[1].some(r=>r[0]==='Kuukausimaksu' && r[1]==='0,00 €/kk ensimmäisen kuukauden, sen jälkeen 5,95 €/kk'));
  assert(cards[2].some(r=>r[0]==='Kuukausimaksu' && r[1]==='2,97 €/kk ensimmäiset 12 kk, sen jälkeen 5,95 €/kk'));
  assert(cards[3].some(r=>r[0]==='Kuukausimaksu' && r[1].includes('31.12.2026 asti')));
  assert(cards.every(rows=>rows.some(r=>r[0]==='Sopimuksen kesto' && r[1]==='Toistaiseksi voimassa')));
  const terms=await run([
    {...offer('Fixed unknown',[]),contract_terms_type:'fixed_term'},
    {...offer('Over24',[]),contract_terms_type:'fixed_term',duration_class:'Over24'},
    {...offer('Known 24',[]),contract_terms_type:'fixed_term',contract_duration_months:24}
  ]);
  assert(terms[0].some(r=>r[0]==='Sopimuksen kesto' && r[1]==='Määräaikainen – tarkista kesto ehdoista'));
  assert(terms[1].some(r=>r[0]==='Sopimuksen kesto' && r[1]==='Määräaikainen, yli 24 kk – tarkista tarkka kesto ehdoista'));
  assert(terms[2].some(r=>r[0]==='Sopimuksen kesto' && r[1]==='24 kk'));
  console.log('PASS: month, calendar campaigns and contract durations');
})().catch(e=>{console.error(e);process.exitCode=1});
