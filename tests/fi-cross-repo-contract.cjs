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
// Reads the actual Core REST response from stdin, renders using the real Pages JS.
(async()=>{
 const input=JSON.parse(fs.readFileSync(0,'utf8'));
 assert.equal(input.contract_comparison,'available');
 const offers=[...(input.top_fixed_offers||[]),...(input.top_spot_offers||[])];
 assert(offers.length>0,'Core must return an offer');
 const rows=await run(offers);
 const expected=process.env.EXPECT_DURATION_TEXT||'Määräaikainen, yli 24 kk – tarkista tarkka kesto ehdoista';
 assert(rows.some(card=>card.some(row=>row[0]==='Sopimuksen kesto'&&row[1]===expected)),
        'Pages must render the expected contract duration from Core REST');
 console.log('PASS: Core REST -> Pages duration display');
})().catch(e=>{console.error(e);process.exitCode=1});
