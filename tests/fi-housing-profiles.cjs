// Run: node tests/fi-housing-profiles.cjs. Exercises the actual page script.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../fi/sahkosopimukset/comparison.js'), 'utf8');
const profiles = [
  ['fi_apartment_district_v1', 2000, 'Kerrostalo, kaukolämmitys', 'district'],
  ['fi_small_house_non_electric_v1', 5500, 'Pientalo ilman sähkölämmitystä', 'non_electric'],
  ['fi_terraced_electric_v1', 11000, 'Sähkölämmitteinen rivitaloasunto', 'electric'],
  ['fi_detached_electric_v1', 18000, 'Sähkölämmitteinen omakotitalo', 'electric'],
];
class Element {
  constructor(value = '') { this.value = value; this.children = []; this.handlers = {}; this.hidden = true; this.disabled = false; this.validation = ''; this.valid = true; this.step = '1000'; }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  querySelector() { return this.button ||= new Element(); }
  reportValidity() { return this.valid && !this.validation; }
  setCustomValidity(message) { this.validation = message; }
  focus() { this.focused = true; }
}
function responseFor(url) {
  const id = url.searchParams.get('housing_profile');
  const own = url.searchParams.get('consumption');
  const profile = profiles.find(p => p[0] === id);
  const kwh = own !== null ? Number(own) : profile ? profile[1] : 2000;
  const assumptions = { annual_consumption_kwh: kwh, consumption_source: own !== null ? 'user_provided' : profile ? 'estimated_from_housing_type' : 'zone_default',
    main_fuse: url.searchParams.get('fuse') || '3x25', main_fuse_source: url.searchParams.has('fuse') ? 'user_provided' : 'default' };
  if (profile) assumptions.housing_profile = {
    profile_id: profile[0], profile_version: 1, annual_consumption_kwh: profile[1],
    label: profile[2], heating_basis: profile[3], source_url: 'https://www.sahkonhinta.fi/', source_checked_at: '2026-10-29',
  };
  const offers = [1, 2, 3, 4].map(i => ({ provider: 'Server choice ' + i, product_name: 'Product', annual_cost_estimate: i * 100 }));
  return {zone:'FI',currency:'EUR',contract_comparison:'available',assumptions,top_spot_offers:offers,top_fixed_offers:offers};
}
function harness(transform = data => data, options = {}) {
  const elements = {}, requests = [], windowHandlers = {};
  let historyState = options.state ?? null;
  const window = { history: { get state() { return historyState; }, replaceState(next) { if (options.historyFails) throw Error('blocked'); historyState = next; } },
    addEventListener(type, handler) { windowHandlers[type] = handler; } };
  const document = {getElementById:id => elements[id] ||= new Element(), createElement:() => new Element()};
  for (const [id,value] of Object.entries(options.initial || {})) document.getElementById(id).value=value;
  let fail = false;
  vm.runInNewContext(source, {document,window,Intl,URL,URLSearchParams,AbortController,setTimeout:(fn,ms)=>{if(ms===0)fn();return 1;},clearTimeout(){},
    fetch: async target => {
      const url = new URL(target, 'https://elecz.com'); requests.push(url);
      for (const id of ['housing-profile','consumption','postcode','fuse']) assert.equal(elements[id].disabled,true,id+' locked during request');
      for (const id of ['consumption-increase','consumption-decrease']) assert.equal(elements[id].disabled,true,id+' locked during request');
      if (fail) throw new Error('offline');
      return {ok:true,json:async()=>transform(responseFor(url))};
    },
  });
  return {elements,requests,
    state() { return historyState; },
    back() { windowHandlers.pageshow(); },
    arrow(direction) { elements['consumption-'+direction].handlers.click(); },
    key(key) { let prevented=false; elements.consumption.handlers.keydown({key,preventDefault(){prevented=true;}}); return prevented; },
    fail() { fail = true; },
    select(id) { elements['housing-profile'].value = id; elements['housing-profile'].handlers.change(); },
    edit(value) { elements.consumption.value = value; elements.consumption.handlers.input(); },
    async submit() {
      await elements['comparison-form'].handlers.submit({preventDefault(){}});
      for (const id of ['housing-profile','consumption','postcode','fuse']) assert.equal(elements[id].disabled,false,id+' re-enabled');
      return requests.at(-1);
    },
  };
}
const heading = h => h.elements['result-heading'].textContent.replace(/\s/g,' ');
test('untouched visible 2000 sends neither value nor profile and discloses the server default', async () => {
  const h = harness(); const url = await h.submit();
  assert.equal(url.search,'?zone=FI&offer_limit=20');
  assert.equal(heading(h),'Oletuskulutus: 2 000 kWh/vuosi');
  assert.equal(h.elements['consumption-source'].hidden,true);
  assert.equal(h.elements['postcode-notice'].hidden,false);
});
for (const [id,kwh,label] of profiles) test('profile only: '+id, async () => {
  const h = harness(); h.select(id);
  assert.equal(h.elements.consumption.value,String(kwh));
  const url = await h.submit();
  assert.equal(url.searchParams.get('housing_profile'),id);
  assert.equal(url.searchParams.has('consumption'),false);
  assert.equal(heading(h),`Arvio: ${label} · ${new Intl.NumberFormat('fi-FI').format(kwh)} kWh/vuosi`.replace(/\s/g,' '));
  assert.equal(h.elements['consumption-source'].children[0].href,'https://www.sahkonhinta.fi/');
  assert.match(h.elements['fuse-notice'].textContent,/3×25 A/);
  assert.equal(h.elements['spot-offers'].children.length,3);
  assert.equal(h.elements['spot-offers'].children[0].children[0].textContent,'Server choice 1');
});
test('own exact integer sends only consumption', async () => {
  const h = harness(); h.edit('6789'); const url = await h.submit();
  assert.equal(url.searchParams.get('consumption'),'6789');
  assert.equal(url.searchParams.has('housing_profile'),false);
  assert.equal(heading(h),'Ilmoittamasi kulutus: 6 789 kWh/vuosi');
});
test('focus alone leaves an estimate untouched; editing back to the same number makes it own', async () => {
  const h = harness(); h.select(profiles[0][0]); h.elements.consumption.focus();
  assert.equal((await h.submit()).searchParams.get('housing_profile'),profiles[0][0]);
  h.edit('2100'); h.edit('2000');
  const url = await h.submit();
  assert.equal(url.searchParams.get('consumption'),'2000');
  assert.equal(url.searchParams.has('housing_profile'),false);
  assert.equal(heading(h),'Ilmoittamasi kulutus: 2 000 kWh/vuosi');
  h.select(profiles[0][0]);
  assert.equal((await h.submit()).searchParams.has('consumption'),false,'reselect explicitly restores estimate');
});
test('clearing an estimate clears profile and returns to default', async () => {
  const h = harness(); h.select(profiles[3][0]); h.edit('');
  assert.equal(h.elements['housing-profile'].value,'');
  assert.equal((await h.submit()).search,'?zone=FI&offer_limit=20');
  assert.match(heading(h),/^Oletuskulutus:/);
});
test('deselect clears autofill but preserves a manually edited number', async () => {
  const h = harness(); h.select(profiles[1][0]); h.select('');
  assert.equal(h.elements.consumption.value,'');
  h.select(profiles[1][0]); h.edit('6100'); h.select('');
  assert.equal(h.elements.consumption.value,'6100');
  assert.equal((await h.submit()).searchParams.get('consumption'),'6100');
});
test('other property/farm has no invented estimate and keeps fuse selection', async () => {
  const h = harness(); h.elements.fuse.value='3x63'; h.select(profiles[3][0]); h.select('other');
  assert.equal(h.elements.consumption.value,'');
  assert.match(h.elements['consumption-help'].textContent,/Ei asumismuotoarviota/);
  assert.equal(h.elements['advanced-details'].open,true);
  let url = await h.submit();
  assert.equal(url.searchParams.has('consumption'),false); assert.equal(url.searchParams.has('housing_profile'),false);
  assert.equal(url.searchParams.get('fuse'),'3x63'); assert.match(heading(h),/^Oletuskulutus:/);
  h.edit('53000'); h.select('other');
  url = await h.submit(); assert.equal(url.searchParams.get('consumption'),'53000');
  assert.equal(url.searchParams.has('housing_profile'),false);
});
test('profile preserves postcode and fuse; subsequent own/default results remove the source link', async () => {
  const h = harness(); h.elements.postcode.value=' 00100 '; h.elements.fuse.value='3x35'; h.select(profiles[2][0]);
  let url = await h.submit();
  assert.equal(url.searchParams.get('postcode'),'00100'); assert.equal(url.searchParams.get('fuse'),'3x35');
  assert.equal(h.elements['postcode-notice'].hidden,true);
  h.edit('12500'); await h.submit();
  assert.equal(h.elements['consumption-source'].hidden,true); assert.equal(h.elements['consumption-source'].children.length,0);
  h.edit(''); h.elements.postcode.value='bad'; url=await h.submit();
  assert.equal(url.searchParams.has('postcode'),false); assert.equal(h.elements['postcode-notice'].hidden,false);
});
test('result profile label and default number come from the server response', async () => {
  const h = harness(data => {data.assumptions.housing_profile.label='Palvelimen profiilinimi'; return data;});
  h.select(profiles[0][0]); await h.submit();
  assert.equal(heading(h),'Arvio: Palvelimen profiilinimi · 2 000 kWh/vuosi');
  const d = harness(data => {data.assumptions.annual_consumption_kwh=2500;return data;}); await d.submit();
  assert.equal(heading(d),'Oletuskulutus: 2 500 kWh/vuosi');
});
for (const value of ['0','-1','1.5','Infinity','9007199254740992','abc']) test('invalid own consumption is not sent: '+value, async () => {
  const h = harness(); h.edit(value); await h.submit();
  assert.equal(h.requests.length,0); assert.match(h.elements.consumption.validation,/positiivisena kokonaislukuna/);
  h.edit('2000'); await h.submit(); assert.equal(h.requests.length,1,'valid edit clears old error');
});
test('native badInput blocks a malformed number, rather than using default', async () => {
  const h = harness(); h.elements['comparison-form'].valid=false; await h.submit();
  assert.equal(h.requests.length,0);
});
for (const [name,corrupt] of [
  ['wrong source',a => a.consumption_source='user_provided'],
  ['wrong kWh',a => a.annual_consumption_kwh=5500],
  ['missing profile',a => delete a.housing_profile],
  ['wrong profile',a => a.housing_profile.profile_id=profiles[1][0]],
  ['wrong URL',a => a.housing_profile.source_url='https://sahkonhinta.fi/'],
  ['wrong metadata kWh',a => a.housing_profile.annual_consumption_kwh=5500],
  ['wrong version',a => a.housing_profile.profile_version=2],
]) test('unconfirmed estimate never renders offers: '+name, async () => {
  const h = harness(data => {corrupt(data.assumptions);return data;}); h.select(profiles[0][0]); await h.submit();
  assert.equal(h.elements.results.hidden,true); assert.equal(h.elements.status.className,'error');
  assert.equal(h.elements.consumption.value,'2000','requested estimate remains available for retry');
});
test('network failure hides stale offers and leaves the estimate available for retry', async () => {
  const h = harness(); await h.submit(); h.select(profiles[3][0]); h.fail(); await h.submit();
  assert.equal(h.elements.results.hidden,true); assert.equal(h.elements.status.className,'error');
  assert.equal(h.elements.consumption.value,'18000'); assert.equal(h.elements['housing-profile'].value,profiles[3][0]);
});
test('accessible optional markup, initial 2000, exact manual input and initially closed fuse disclosure', () => {
  const html=fs.readFileSync(path.join(__dirname,'../fi/sahkosopimukset/index.html'),'utf8');
  const input=html.match(/<input\b[^>]*id="consumption"[^>]*>/)[0];
  assert.doesNotMatch(input,/\brequired\b|5000/);
  assert.match(input,/value="2000"/); assert.match(input,/step="1"/);
  assert.match(html,/id="consumption-increase" type="button" aria-label="Lisää vuosikulutusta 1 000 kWh"/);
  assert.match(html,/id="consumption-decrease" type="button"/);
  assert.match(html,/<label for="housing-profile"/); assert.match(html,/aria-describedby="housing-help consumption-help"/);
  for (const [id] of profiles) assert(html.includes(`value="${id}"`));
  assert.match(html,/Muu kohde \(esim\. maatila tai suuri kiinteistö\)/);
  assert.match(html,/<label for="fuse" class="field-gap">Pääsulake/);
  assert.match(html,/<details id="advanced-details"><summary>Tarkenna tietoja<\/summary>[\s\S]*?<select id="fuse"[\s\S]*?<\/details>/);
  assert.doesNotMatch(html,/<details[^>]*\bopen\b/);
});


test('initial visible default and focus alone remain default; arrow changes are own input', async () => {
  const h=harness(); assert.equal(h.elements.consumption.value,'2000'); h.elements.consumption.focus();
  assert.equal((await h.submit()).search,'?zone=FI&offer_limit=20');
  h.arrow('increase'); assert.equal(h.elements.consumption.value,'3000');
  h.arrow('decrease'); assert.equal(h.elements.consumption.value,'2000');
  assert.equal((await h.submit()).searchParams.get('consumption'),'2000');
  assert.match(heading(h),/^Ilmoittamasi kulutus:/);
});
test('arrows add and subtract exactly 1000 from off-grid profiles and exact own numbers', async () => {
  const h=harness();h.select(profiles[1][0]);h.arrow('increase');
  assert.equal(h.elements.consumption.value,'6500');assert.equal(h.elements['housing-profile'].value,'');
  assert.equal((await h.submit()).searchParams.get('consumption'),'6500');
  h.edit('6789');h.arrow('increase');assert.equal(h.elements.consumption.value,'7789');
  h.arrow('decrease');assert.equal(h.elements.consumption.value,'6789');
  assert.equal((await h.submit()).searchParams.get('consumption'),'6789');
});
test('keyboard arrows use exact 1000 increments and leave other keys alone', () => {
  const h=harness();h.select(profiles[1][0]);assert.equal(h.key('ArrowUp'),true);
  assert.equal(h.elements.consumption.value,'6500');h.key('ArrowDown');assert.equal(h.elements.consumption.value,'5500');
  assert.equal(h.key('Tab'),false);assert.equal(h.elements.consumption.value,'5500');
});
test('decrement never makes consumption zero or negative, and arrows recover an empty field', () => {
  const h=harness();h.arrow('decrease');assert.equal(h.elements.consumption.value,'1000');
  assert.equal(h.elements['consumption-decrease'].disabled,true);h.key('ArrowDown');assert.equal(h.elements.consumption.value,'1000');
  h.edit('789');h.arrow('decrease');assert.equal(h.elements.consumption.value,'789');
  h.edit('');h.arrow('increase');assert.equal(h.elements.consumption.value,'3000');
});
test('advanced details stay closed initially, and open for other property or a restored selected fuse', () => {
  const h=harness();assert.notEqual(h.elements['advanced-details'].open,true);h.select('other');
  assert.equal(h.elements.consumption.value,'');assert.equal(h.elements['advanced-details'].open,true);
  const f=harness(undefined,{initial:{fuse:'3x35'}});assert.equal(f.elements['advanced-details'].open,true);
});
for(const [origin,choice,value,expected] of [
  ['default','','2000','?zone=FI&offer_limit=20'],
  ['user','','2000','?zone=FI&offer_limit=20&consumption=2000'],
  ['profile',profiles[1][0],'5500','?zone=FI&offer_limit=20&housing_profile='+profiles[1][0]],
]) test('back navigation restores coherent '+origin+' state and provenance without fetching', async () => {
  const h=harness();if(origin==='user')h.edit(value);if(origin==='profile')h.select(choice);
  const saved=h.state();h.elements.consumption.value='18000';h.elements['housing-profile'].value=profiles[3][0];h.back();
  assert.equal(h.requests.length,0);assert.equal(h.elements.consumption.value,value);assert.equal(h.elements['housing-profile'].value,choice);
  assert.equal(h.state().eleczFiConsumption.origin,origin);assert.equal((await h.submit()).search,expected);
  const reload=harness(undefined,{state:saved});assert.equal((await reload.submit()).search,expected);
});
test('invalid older restored profile is cleared and the visible number is treated as own', async () => {
  const h=harness(undefined,{state:{eleczFiConsumption:{version:1,origin:'profile',choice:profiles[0][0],profile:profiles[0][0],value:'5500'}},
    initial:{'housing-profile':profiles[0][0],consumption:'5500'}});
  assert.equal(h.elements['housing-profile'].value,'');assert.equal((await h.submit()).searchParams.get('consumption'),'5500');
});
test('history preserves unrelated entry metadata and unavailable history does not break comparison', async () => {
  const h=harness(undefined,{state:{router:'unchanged'}});h.edit('6000');assert.equal(h.state().router,'unchanged');
  const denied=harness(undefined,{historyFails:true});denied.select(profiles[1][0]);
  assert.equal((await denied.submit()).searchParams.get('housing_profile'),profiles[1][0]);
});
