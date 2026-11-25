const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../au/compare/comparison.js'), 'utf8');
const fixture = require('./fixtures/au-responses.json');
class Element {
  constructor(tag='div') { this.tag=tag; this.children=[]; this.handlers={}; this.value=''; this._text=''; }
  set textContent(value) { this._text=String(value); this.children=[]; }
  get textContent() { return this._text + this.children.map(e=>e.textContent).join(' '); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children=[...children]; this._text=''; }
  addEventListener(event,callback) { this.handlers[event]=callback; }
  setAttribute(name,value) { this[name]=value; }
  reportValidity() { return true; }
  focus() { this.focused=true; }
}
function harness(fetch=async()=>{throw new Error('unexpected fetch');}) {
  const elements=Object.fromEntries(['comparison-form','comparison-status','comparison-result','postcode','consumption','meter-type','distributor','compare-button'].map(id=>['#'+id,new Element()]));
  elements['.refinements']=new Element('details');
  elements['#postcode'].value='2650'; elements['#consumption'].value='4500';
  let timeout;
  const context=vm.createContext({document:{querySelector:s=>elements[s],createElement:tag=>new Element(tag)},
    Intl,URLSearchParams,AbortController,fetch,setTimeout:f=>(timeout=f,1),clearTimeout:()=>{}});
  vm.runInContext(source,context);
  return { context,elements,render:data=>context.render(data,{postcode:'2650',consumption:4500}),
    submit:()=>context.submit({preventDefault(){}}),text:()=>elements['#comparison-result'].textContent,
    status:()=>elements['#comparison-status'].textContent,timeout:()=>timeout() };
}
function available(overrides={}) { return {contract_comparison:'available',market:'AU_NSW',currency:'AUD',
  cost_scope:'annual_electricity_supply_including_gst',postcode:'2650',annual_consumption_kwh:4500,
  freshness:'fresh',distributor:'Essential Energy',distributors:fixture.groups,
  offers:[fixture.offer],recommended:fixture.offer,...overrides}; }
function shared() { return available({distributor:null,distributor_scope:'all_listed',comparison_scope:'common_eligible_offers',distributor_notice:fixture.notice}); }
function cards(h) { return h.elements['#comparison-result'].children.find(e=>e.className==='offers')?.children || []; }

test('2000/single distributor shows only returned estimate with AUD/GST and no invented rates',()=>{
  const h=harness();h.context.render(available({postcode:'2000',distributor:'Ausgrid',distributors:['Ausgrid']}),{postcode:'2000',consumption:4500});
  assert.equal(cards(h).length,1);assert.match(h.text(),/AUD\s*1,976\.54/);assert.match(h.text(),/includes GST/);
  assert.doesNotMatch(h.text(),/daily supply charge|usage rate|savings/);
});
test('2650/common scope is conspicuous and preserves API notice as text',()=>{
  const h=harness();h.render(shared());
  assert.match(h.text(),/This comparison includes plans available across all listed distributor options/);
  assert.match(h.text(),/additional or cheaper plans/);assert.ok(h.text().includes(fixture.notice));
  assert.match(cards(h)[0].textContent,/Lowest estimate in the shared plan set/);
});
test('2650/explicit network follows returned source and price, without common scope claim',()=>{
  const h=harness();h.render(available());assert.match(h.text(),/Distributor or tariff area: Essential Energy/);
  assert.doesNotMatch(h.text(),/shared plan set/);
});
test('empty safe intersection asks for exact source option and shows resolution safely',()=>{
  const h=harness();h.render({contract_comparison:'needs_distributor',distributors:fixture.groups,distributor_resolution:fixture.resolution});
  assert.equal(cards(h).length,0);assert.match(h.status(),/No safe shared comparison/);
  assert.ok(h.text().includes(fixture.resolution.message));assert.equal(h.elements['.refinements'].open,true);
  assert.deepEqual(h.elements['#distributor'].children.slice(1).map(e=>e.value),fixture.groups);
});
test('refined retry sends exact distributor and only supported parameters',async()=>{
  const calls=[];const h=harness(async(url)=>{calls.push(url);return {ok:true,json:async()=>available()};});
  h.render({contract_comparison:'needs_distributor',distributors:fixture.groups});
  h.elements['#distributor'].value=fixture.groups[2];h.elements['#meter-type'].value='Type 6';
  await h.submit();const q=new URL('https://test.invalid'+calls[0]).searchParams;
  assert.equal(q.get('distributor'),fixture.groups[2]);assert.equal(q.get('meter_type'),'Type 6');
  assert.deepEqual([...q.keys()].sort(),['zone','postcode','consumption','distributor','meter_type'].sort());
  assert.equal(q.get('zone'),'AU-NSW');
});
for (const input of ['abc','200','２０００','12345']) test('invalid postcode does not call API: '+input,async()=>{
  let count=0;const h=harness(async()=>{count++;});h.elements['#postcode'].value=input;await h.submit();assert.equal(count,0);assert.equal(cards(h).length,0);
});
test('postcode string retains leading zero and rates are not calculated in browser',async()=>{
  let url;const h=harness(async u=>(url=u,{ok:true,json:async()=>({contract_comparison:'not_available',reason:'state_not_supported'})}));
  h.elements['#postcode'].value='0800';await h.submit();assert.equal(new URL('https://x.invalid'+url).searchParams.get('postcode'),'0800');assert.match(h.status(),/Only New South Wales/);
});
for(const data of [
  {contract_comparison:'not_available'}, // current disabled AU response
  {contract_comparison:'not_available',reason:'snapshot_unavailable'},
  {contract_comparison:'insufficient_data'},
  available({offers:[],recommended:null}),
  available({freshness:'stale'}),
  available({freshness:'unavailable'}),
  sharedMissing('distributor_notice'), sharedMissing('comparison_scope'),
  available({comparison_scope:'common_eligible_offers'}),available({currency:'EUR'}),available({recommended:{...fixture.offer,annual_supply_cost_aud:1}})
]) test('no misleading offer for unavailable/empty/invalid response '+JSON.stringify(data).slice(0,80),()=>{
  const h=harness();h.render(available());h.render(data);assert.equal(cards(h).length,0);assert.doesNotMatch(h.text(),/1976/);
});
function sharedMissing(key) {const data=shared();delete data[key];return data;}
test('disabled comparison uses precise public availability wording',()=>{
  const h=harness();h.render({contract_comparison:'not_available'});assert.equal(h.status(),'NSW electricity plan comparison is not yet publicly available.');
});
for(const status of [400,422,503]) test('HTTP '+status+' removes previous results and never retries',async()=>{
  let count=0;const h=harness(async()=>{count++;return {ok:false,status};});h.render(available());await h.submit();
  assert.equal(count,1);assert.equal(cards(h).length,0);assert.ok(!h.elements['#compare-button'].disabled);
});
test('network error is safe and has no fabricated successful response',async()=>{
  const h=harness(async()=>{throw new Error('offline');});await h.submit();assert.match(h.status(),/temporarily unavailable/);assert.equal(cards(h).length,0);
});
test('timeout aborts once, removes previous offer, and allows manual retry',async()=>{
  let count=0;const h=harness((url,options)=>new Promise((resolve,reject)=>{count++;options.signal.addEventListener('abort',()=>reject({name:'AbortError'}));}));
  h.render(available());const pending=h.submit();h.timeout();await pending;
  assert.equal(count,1);assert.equal(cards(h).length,0);assert.match(h.status(),/timed out/);assert.equal(h.elements['#compare-button'].disabled,false);
});
test('edit cancels stale response and clears postcode-specific options',async()=>{
  let resolve;const h=harness(()=>new Promise(r=>{resolve=r;}));const pending=h.submit();
  h.elements['#postcode'].handlers.input();resolve({ok:true,json:async()=>shared()});await pending;
  assert.equal(cards(h).length,0);assert.equal(h.elements['#distributor'].children.length,1);
});
test('all API text uses literal text nodes, including malicious supplier and network labels',()=>{
  const h=harness();const evil='<img src=x onerror=alert(1)>';
  h.render(shared());h.render(available({distributors:[evil],distributor:evil,offers:[{...fixture.offer,supplier:evil}],recommended:{...fixture.offer,supplier:evil}}));
  assert.ok(h.text().includes(evil));assert.doesNotMatch(source,/innerHTML|insertAdjacentHTML|document\.write/);
});
test('draft pages have noindex, no embedded sample price, and no discovery/worker changes are required',()=>{
  for(const filename of ['au/index.html','au/compare/index.html']) {
    const html=fs.readFileSync(path.join(__dirname,'..',filename),'utf8');
    assert.match(html,/<html lang="en-AU">/);assert.match(html,/name="robots" content="noindex, nofollow"/);
    assert.match(html,/NSW electricity plan comparison is not yet publicly available/);
    assert.ok(!html.includes(String(fixture.offer.annual_supply_cost_aud)));
  }
  assert.doesNotMatch(source,/fixtures|1976\.54|Example Retailer|https:\/\//);
  for(const filename of ['sitemap.xml','llms.txt','index.html']) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'..',filename),'utf8'),/\/au\//);
  }
});
