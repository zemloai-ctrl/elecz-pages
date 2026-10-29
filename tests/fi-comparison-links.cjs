// Run: node tests/fi-comparison-links.cjs (no dependencies or live services).
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
class Element {
  constructor() { this.children=[]; this.handlers={}; this.value='5000'; }
  append(...items) { this.children.push(...items); }
  replaceChildren() { this.children=[]; }
  setAttribute() {}
  addEventListener(type, fn) { this.handlers[type]=fn; }
  querySelector() { return this.button ||= new Element(); }
  reportValidity() { return true; }
  setCustomValidity() {}
  focus() {}
}
const go='https://elecz.com/go/FI_EV_123?zone=FI&offer_id=00000000-0000-0000-0000-000000000001';
const offer={provider:'Supplier',product_name:'Product',annual_cost_estimate:100,basic_fee_eur_month:null,contract_duration_months:null,direct_url:'https://supplier.fi/product',affiliate_url:null};
const data=()=>({zone:'FI',currency:'EUR',contract_comparison:'available',assumptions:{annual_consumption_kwh:5000,consumption_source:'user_provided'},top_spot_offers:[{...offer}],top_fixed_offers:[],recommended:{contract:{...offer}},action:{available:true,action_link:'https://elecz.com/go/FI_EV_123?zone=FI&offer=source-offer'},timestamp:'2026-10-18T17:25:00Z'});
async function render(response) {
  const elements={}; const timers=[]; const cleared=[];
  const document={getElementById:id=>elements[id] ||=new Element(),createElement:()=>new Element()};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../fi/sahkosopimukset/comparison.js'),'utf8'), {
    document,Intl,URL,URLSearchParams,AbortController,
    setTimeout:(fn,ms)=>{timers.push(ms);return timers.length;},clearTimeout:id=>cleared.push(id),
    fetch:async url=>{assert.equal(url,'/signal/contract?zone=FI&consumption=5000');return {ok:true,json:async()=>response};}
  });
  await elements['comparison-form'].handlers.submit({preventDefault(){}});
  assert.deepEqual(timers,[5000,60000]); assert.equal(cleared.length,2);
  return elements;
}
const link=elements=>elements['spot-offers'].children[0].children.at(-1).href;
(async()=>{
  let d=data();d.top_spot_offers[0].go_url=go;d.recommended.contract.go_url=go;
  let elements=await render(d);assert.equal(link(elements),go+'&src=web');
  d=data();elements=await render(d);assert.equal(link(elements),d.action.action_link+'&src=web');
  d=data();d.recommended.contract=null;d.top_spot_offers[0].go_url=go+'&src=mcp';
  elements=await render(d);assert.equal(link(elements),go+'&src=web');
  d=data();d.recommended.contract=null;d.top_spot_offers[0].go_url='https://other.example/go/forged';
  d.top_spot_offers[0].affiliate_url='https://affiliate.example/product';
  elements=await render(d);assert.equal(link(elements),'https://affiliate.example/product');
  d=data();d.recommended.contract=null;elements=await render(d);assert.equal(link(elements),offer.direct_url);
  d=data();d.top_spot_offers=[];elements=await render(d);assert.equal(elements.results.hidden,false);
  console.log('PASS: canonical link priority, web source, legacy action, affiliate/direct fallback, foreign go URL rejected, empty result, timer cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
