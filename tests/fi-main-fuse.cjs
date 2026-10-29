// Run: node tests/fi-main-fuse.cjs
// Main fuse (pääsulake): selection is sent as ?fuse=, and the page shows
// exactly the fuse the backend reports it priced with.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
class Element {
  constructor(value='5000') { this.children=[]; this.handlers={}; this.value=value; this.hidden=false; this.disabled=false; }
  append(...x) { this.children.push(...x); }
  replaceChildren() { this.children=[]; }
  setAttribute() {}
  addEventListener(type,fn) { this.handlers[type]=fn; }
  querySelector() { return this.button ||= new Element(); }
  reportValidity() { return true; }
  setCustomValidity() {}
  focus() {}
}
async function run({selected='', assumptions={}}) {
  const elements={fuse:new Element(selected)};
  const document={getElementById:id=>elements[id] ||=new Element(),createElement:()=>new Element()};
  const data={zone:'FI',currency:'EUR',contract_comparison:'available',
    assumptions:{annual_consumption_kwh:5000,consumption_source:'user_provided',...assumptions},top_spot_offers:[],top_fixed_offers:[]};
  let requested;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../fi/sahkosopimukset/comparison.js'),'utf8'),{
    document,Intl,URL,URLSearchParams,AbortController,setTimeout:()=>1,clearTimeout:()=>{},
    fetch:async(url)=>{requested=new URL(url,'https://elecz.com');return {ok:true,json:async()=>data};}
  });
  await elements['comparison-form'].handlers.submit({preventDefault(){}});
  const notice=elements['fuse-notice'];
  return {fuse:requested.searchParams.get('fuse'), hidden:notice.hidden, text:notice.textContent,
          selectEnabled:!elements.fuse.disabled};
}
(async()=>{
  let r=await run({assumptions:{main_fuse:'3x25',main_fuse_source:'default'}});
  assert.equal(r.fuse,null);
  assert.equal(r.hidden,false);
  assert.equal(r.text,'Vertailussa oletetaan pääsulakekooksi 3×25 A. Tarkista sulakekokosi, sillä se voi vaikuttaa hintaan.');
  assert.equal(r.selectEnabled,true);

  r=await run({selected:'3x35',assumptions:{main_fuse:'3x35',main_fuse_source:'user_provided'}});
  assert.equal(r.fuse,'3x35');
  assert.equal(r.text,'Hinnat on verrattu pääsulakkeelle 3×35 A.');

  // Selected but backend did not confirm (older backend or mismatch): say so.
  for (const assumptions of [{}, {main_fuse:'3x25',main_fuse_source:'default'},
                             {main_fuse:'3x25',main_fuse_source:'user_provided'}]) {
    r=await run({selected:'3x35',assumptions});
    assert.equal(r.fuse,'3x35');
    assert.equal(r.text,'Valittua pääsulaketta ei voitu huomioida tässä vertailussa. Tarkista hinnat sähköyhtiöltä.');
  }

  // Nothing selected and nothing reported: no claim is made.
  r=await run({assumptions:{}});
  assert.equal(r.hidden,true);
  assert.equal(r.text,'');

  // Unexpected select values are never forwarded.
  for (const bad of ['5000','3x25 A','4x25','3x0','<script>']) {
    r=await run({selected:bad,assumptions:{main_fuse:'3x25',main_fuse_source:'default'}});
    assert.equal(r.fuse,null, bad);
  }

  // Markup offers the default plus explicit sizes; default is preselected.
  const html=fs.readFileSync(path.join(__dirname,'../fi/sahkosopimukset/index.html'),'utf8');
  assert.match(html,/<option value="" selected>En tiedä – oletus 3×25 A<\/option>/);
  for (const v of ['1x25','3x25','3x35','3x50','3x63']) assert(html.includes(`<option value="${v}">`), v);
  assert(html.includes('id="fuse-notice"'));
  console.log('PASS: fuse selection forwarded, default and user fuse disclosed, unconfirmed fuse flagged, bad values dropped');
})().catch(e=>{console.error(e);process.exitCode=1});
