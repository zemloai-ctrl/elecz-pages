// Pipe an unmodified Core REST response to this test. No network or external writes.
// QUERY='housing_profile=fi_apartment_district_v1' node tests/fi-core-consumption-response.cjs < response.json
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
class Element {
  constructor(value='') {this.value=value;this.children=[];this.handlers={};this.hidden=true;}
  append(...children) {this.children.push(...children);}
  replaceChildren() {this.children=[];}
  addEventListener(type,fn) {this.handlers[type]=fn;}
  setAttribute() {}
  querySelector() {return this.button ||= new Element();}
  reportValidity() {return true;}
  setCustomValidity() {}
  focus() {}
}
(async () => {
  const data = JSON.parse(fs.readFileSync(0,'utf8'));
  const query = new URLSearchParams(process.env.QUERY || '');
  const elements = {}, document = {getElementById:id=>elements[id] ||=new Element(),createElement:()=>new Element()};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../fi/sahkosopimukset/comparison.js'),'utf8'), {
    document,Intl,URL,URLSearchParams,AbortController,setTimeout:()=>1,clearTimeout(){},
    fetch: async target => {
      const sent = new URL(target,'https://elecz.com').searchParams;
      assert.equal(sent.get('zone'),'FI');
      for (const name of ['consumption','housing_profile','postcode','fuse']) assert.equal(sent.get(name),query.get(name),name);
      return {ok:true,json:async()=>data};
    },
  });
  for (const id of ['postcode','fuse']) elements[id].value=query.get(id)||'';
  if (query.has('housing_profile')) {
    elements['housing-profile'].value=query.get('housing_profile');
    elements['housing-profile'].handlers.change();
  }
  if (query.has('consumption')) {
    elements.consumption.value=query.get('consumption');elements.consumption.handlers.input();
  }
  await elements['comparison-form'].handlers.submit({preventDefault(){}});
  assert.equal(elements.results.hidden,false,elements.status.textContent);
  const a=data.assumptions, prefix=a.consumption_source==='user_provided'?'Ilmoittamasi kulutus:':a.consumption_source==='estimated_from_housing_type'?'Arvio:':'Oletuskulutus:';
  assert(elements['result-heading'].textContent.startsWith(prefix));
  assert(elements['result-heading'].textContent.includes(new Intl.NumberFormat('fi-FI').format(a.annual_consumption_kwh)));
  if (a.housing_profile) {
    assert(elements['result-heading'].textContent.includes(a.housing_profile.label));
    assert.equal(elements['consumption-source'].children[0].href,a.housing_profile.source_url);
  }
  for (const [id,offers] of [['spot-offers',data.top_spot_offers],['fixed-offers',data.top_fixed_offers]]) {
    assert(offers.length>0,'actual Core response must include offers');
    assert.deepEqual(elements[id].children.map(card=>card.children[0].textContent),offers.slice(0,3).map(offer=>offer.provider));
  }
  console.log('PASS: actual Core REST -> Pages consumption, provenance, offer order: '+query.toString());
})().catch(error=>{console.error(error);process.exitCode=1;});
