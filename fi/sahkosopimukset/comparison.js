'use strict';
(() => {
  const form = document.getElementById('comparison-form');
  const input = document.getElementById('consumption');
  const housingSelect = document.getElementById('housing-profile');
  const consumptionHelp = document.getElementById('consumption-help');
  const postcodeInput = document.getElementById('postcode');
  const fuseSelect = document.getElementById('fuse');
  const advanced = document.getElementById('advanced-details');
  const increase = document.getElementById('consumption-increase');
  const decrease = document.getElementById('consumption-decrease');
  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('status');
  const results = document.getElementById('results');
  const number = (value, digits = 2) => new Intl.NumberFormat('fi-FI', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
  const numeric = value => typeof value === 'number' && Number.isFinite(value);
  // UI autofill only. Core resolves the submitted profile ID to the actual kWh.
  const housingProfiles = Object.freeze({
    fi_apartment_district_v1: 2000,
    fi_small_house_non_electric_v1: 5500,
    fi_terraced_electric_v1: 11000,
    fi_detached_electric_v1: 18000,
  });
  const DEFAULT_CONSUMPTION = 2000;
  const CONSUMPTION_STEP = 1000;
  const view = typeof window === 'object' ? window : null;
  const HISTORY_KEY = 'eleczFiConsumption';
  if (input.value === '') input.value = String(DEFAULT_CONSUMPTION);
  let consumptionOrigin = input.value === String(DEFAULT_CONSUMPTION) ? 'default' : 'user';
  let estimatedProfile = null;
  function updateConsumptionHelp() {
    if (estimatedProfile) consumptionHelp.textContent = 'Asumismuotoarvio. Muokkaus tekee luvusta ilmoittamasi kulutuksen.';
    else if (housingSelect.value === 'other') consumptionHelp.textContent = 'Ei asumismuotoarviota. Anna oma kulutus ja tarkista pääsulake.';
    else if (consumptionOrigin === 'default') consumptionHelp.textContent = 'Oletus 2\u00a0000\u00a0kWh/vuosi. Voit muuttaa lukua.';
    else consumptionHelp.textContent = 'Löydät oman vuosikulutuksen sähkölaskulta.';
  }
  function openAdvancedIfNeeded() {
    if (housingSelect.value === 'other' || selectedFuse()) advanced.open = true;
  }
  function updateStepButtons() {
    const amount = Number(input.value);
    increase.disabled = input.disabled;
    decrease.disabled = input.disabled || (input.value !== '' && Number.isSafeInteger(amount) && amount > 0 && amount <= CONSUMPTION_STEP);
  }
  function saveFormState() {
    if (!view?.history?.replaceState) return;
    try {
      const state = view.history.state;
      if (state !== null && (typeof state !== 'object' || Array.isArray(state))) return;
      view.history.replaceState({ ...state, [HISTORY_KEY]: {
        version: 1, origin: consumptionOrigin, profile: estimatedProfile,
        choice: housingSelect.value, value: input.value,
      } }, '');
    } catch { /* History storage may be unavailable; the form still works. */ }
  }
  function ownConsumption() {
    if (Object.hasOwn(housingProfiles, housingSelect.value)) housingSelect.value = '';
    estimatedProfile = null;
    consumptionOrigin = input.value.trim() === '' ? 'default' : 'user';
    input.setCustomValidity('');
    updateConsumptionHelp(); updateStepButtons(); saveFormState();
  }
  function stepConsumption(delta) {
    if (input.disabled) return;
    const parsed = Number(input.value);
    const current = input.value.trim() !== '' && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_CONSUMPTION;
    const next = current + delta;
    if (!Number.isSafeInteger(next) || next <= 0) return;
    input.value = String(next);
    ownConsumption();
  }
  increase.addEventListener('click', () => stepConsumption(CONSUMPTION_STEP));
  decrease.addEventListener('click', () => stepConsumption(-CONSUMPTION_STEP));
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      stepConsumption(event.key === 'ArrowUp' ? CONSUMPTION_STEP : -CONSUMPTION_STEP);
    }
  });
  function restoreFormState() {
    let saved;
    try { saved = view?.history?.state?.[HISTORY_KEY]; } catch { /* Use the visible form. */ }
    const knownChoice = saved && (saved.choice === '' || saved.choice === 'other' || Object.hasOwn(housingProfiles, saved.choice));
    const amount = saved && typeof saved.value === 'string' ? Number(saved.value) : NaN;
    const validNumber = Number.isSafeInteger(amount) && amount > 0;
    const validProfile = saved?.origin === 'profile' && saved.profile === saved.choice &&
      Object.hasOwn(housingProfiles, saved.profile) && amount === housingProfiles[saved.profile];
    const validDefault = saved?.origin === 'default' && saved.profile === null &&
      !Object.hasOwn(housingProfiles, saved.choice) && (saved.value === '' || saved.value === String(DEFAULT_CONSUMPTION));
    const validOwn = saved?.origin === 'user' && saved.profile === null &&
      !Object.hasOwn(housingProfiles, saved.choice) && validNumber;
    if (saved?.version === 1 && knownChoice && typeof saved.value === 'string' && (validProfile || validDefault || validOwn)) {
      input.value = saved.value; housingSelect.value = saved.choice;
      consumptionOrigin = saved.origin; estimatedProfile = saved.profile;
    } else {
      // Older/unknown restored state has no verified estimate provenance.
      const hadProfile = Object.hasOwn(housingProfiles, housingSelect.value);
      if (hadProfile) housingSelect.value = '';
      estimatedProfile = null;
      consumptionOrigin = input.value === '' || (!hadProfile && input.value === String(DEFAULT_CONSUMPTION)) ? 'default' : 'user';
    }
    input.setCustomValidity('');
    updateConsumptionHelp(); updateStepButtons(); openAdvancedIfNeeded(); saveFormState();
  }
  housingSelect.addEventListener('change', () => {
    const id = housingSelect.value;
    const wasEstimate = estimatedProfile !== null;
    estimatedProfile = Object.hasOwn(housingProfiles, id) ? id : null;
    if (estimatedProfile) {
      input.value = String(housingProfiles[estimatedProfile]); consumptionOrigin = 'profile';
    } else if (wasEstimate || (id === 'other' && consumptionOrigin === 'default')) {
      input.value = ''; consumptionOrigin = 'default';
    }
    input.setCustomValidity('');
    updateConsumptionHelp(); updateStepButtons(); openAdvancedIfNeeded(); saveFormState();
  });
  input.addEventListener('input', ownConsumption);
  fuseSelect.addEventListener('change', openAdvancedIfNeeded);
  if (view?.addEventListener) view.addEventListener('pageshow', () => {
    // Run after the browser's own form restoration, including bfcache returns.
    setTimeout(restoreFormState, 0);
  });
  function consumptionSummary(data, requested) {
    const assumptions = data.assumptions;
    const kwh = assumptions?.annual_consumption_kwh;
    const source = assumptions?.consumption_source;
    const profile = assumptions?.housing_profile;
    if (!Number.isSafeInteger(kwh) || kwh <= 0) throw new Error('consumption');
    if (requested.profile) {
      if (source !== 'estimated_from_housing_type' || profile?.profile_id !== requested.profile ||
          profile.profile_version !== 1 || profile.annual_consumption_kwh !== kwh ||
          kwh !== housingProfiles[requested.profile] || profile.source_url !== 'https://www.sahkonhinta.fi/' ||
          typeof profile.label !== 'string' || !profile.label.trim()) throw new Error('profile');
      return { text: `Arvio: ${profile.label} · ${number(kwh, 0)}\u00a0kWh/vuosi`, sourceUrl: profile.source_url };
    }
    if (profile != null) throw new Error('profile');
    if (requested.consumption !== null) {
      if (source !== 'user_provided' || kwh !== requested.consumption) throw new Error('consumption');
      return { text: `Ilmoittamasi kulutus: ${number(kwh, 0)}\u00a0kWh/vuosi` };
    }
    if (source !== 'zone_default') throw new Error('consumption_source');
    return { text: `Oletuskulutus: ${number(kwh, 0)}\u00a0kWh/vuosi` };
  }
  function node(tag, content, className) {
    const element = document.createElement(tag);
    if (content !== undefined) element.textContent = content;
    if (className) element.className = className;
    return element;
  }
  function safeUrl(value) {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }
  function webExecutionUrl(value) {
    const safe = safeUrl(value);
    if (!safe) return null;
    const url = new URL(safe);
    if (url.origin !== 'https://elecz.com' || !url.pathname.startsWith('/go/')) return null;
    url.searchParams.set('src', 'web');
    return url.href;
  }
  function offerLink(offer, data) {
    const execution = webExecutionUrl(offer.go_url);
    if (execution) return execution;
    // Older responses expose an execution URL only for the recommended offer.
    // Never construct /go/ IDs from provider names, or reuse the winner's link.
    const recommended = data.recommended?.contract;
    if (recommended && JSON.stringify(offer) === JSON.stringify(recommended) && data.action?.available === true) {
      const action = webExecutionUrl(data.action.action_link);
      if (action) return action;
    }
    return safeUrl(offer.affiliate_url) || safeUrl(offer.direct_url);
  }
  function periodText(offer, component) {
    const periods = offer.price_periods;
    if (!Array.isArray(periods)) return null;
    const rows = periods.filter(p => p && p.component === component && numeric(p.amount) &&
      p.currency === 'EUR' && p.unit === (component === 'fixed_fee' ? 'PER_MONTH' : 'PER_KWH'));
    if (!rows.length) return null;
    const fmt = p => (component === 'fixed_fee'
      ? number(p.amount) + ' €/kk'
      : number(p.amount * 100, 4).replace(/0+$/, '').replace(/,$/, '') + ' snt/kWh');
    const first = rows[0];
    if (rows.length === 1 && !first.valid_until_contract_month && !first.valid_until) return fmt(first);
    if (rows.length === 2 && first.valid_from_contract_month === 1 &&
        first.valid_until_contract_month && rows[1].valid_from_contract_month === first.valid_until_contract_month + 1) {
      return fmt(first) + (first.valid_until_contract_month === 1 ? ' ensimmäisen kuukauden, sen jälkeen ' : ' ensimmäiset ' + first.valid_until_contract_month + ' kk, sen jälkeen ') + fmt(rows[1]);
    }
    if (rows.length === 2 && first.valid_until && rows[1].valid_from &&
        new Date(rows[1].valid_from).getTime() > new Date(first.valid_until).getTime()) {
      const date = new Date(first.valid_until);
      if (!Number.isNaN(date.getTime())) return fmt(first) + ' ' +
        new Intl.DateTimeFormat('fi-FI', {timeZone: 'UTC'}).format(date) + ' asti, sen jälkeen ' + fmt(rows[1]);
    }
    return null;
  }
  function card(offer, data) {
    const item = node('li', undefined, 'offer');
    const heading = node('h3', offer.provider || 'Toimittaja ei saatavilla');
    heading.tabIndex = -1;
    item.append(heading, node('p', offer.product_name || 'Tuotenimi ei saatavilla', 'product'));
    if (offer.new_customers_only === true) item.append(node('p', 'Vain uusille asiakkaille', 'badge'));
    item.append(node('p', numeric(offer.annual_cost_estimate) ? `${number(offer.annual_cost_estimate)} €` : 'Arvio ei saatavilla', 'price'), node('p', 'Arvio / ensimmäiset 12 sopimuskuukautta', 'price-label'));
    const details = node('dl');
    const row = (label, value) => { const div = node('div'); div.append(node('dt', label), node('dd', value)); details.append(div); };
    const marginPeriod = periodText(offer, 'margin');
    const energyPeriod = periodText(offer, 'energy');
    const feePeriod = periodText(offer, 'fixed_fee');
    if (marginPeriod) row('Pörssimarginaali', marginPeriod);
    else if (numeric(offer.spot_margin_ckwh)) row('Pörssimarginaali', `${number(offer.spot_margin_ckwh, 4).replace(/0+$/, '').replace(/,$/, '')} snt/kWh`);
    if (energyPeriod) row('Energiahinta', energyPeriod);
    else if (numeric(offer.fixed_price_ckwh)) row('Energiahinta', `${number(offer.fixed_price_ckwh)} snt/kWh`);
    row('Kuukausimaksu', feePeriod || (numeric(offer.basic_fee_eur_month) ? `${number(offer.basic_fee_eur_month)} €/kk` : 'Yhtä kuukausisummaa ei saatavilla'));
    row('Sopimuksen kesto', offer.contract_terms_type === 'ongoing' ? 'Toistaiseksi voimassa' : offer.duration_class === 'Over24' && offer.contract_terms_type === 'fixed_term' ? 'Määräaikainen, yli 24 kk – tarkista tarkka kesto ehdoista' : numeric(offer.contract_duration_months) && offer.contract_duration_months > 0 ? `${number(offer.contract_duration_months, 0)} kk` : offer.contract_terms_type === 'fixed_term' ? 'Määräaikainen – tarkista kesto ehdoista' : 'Ei saatavilla – tarkista ehdot');
    if (offer.price_includes_tax === true) row('Arvonlisävero', 'Sisältyy hintoihin');
    item.append(details);
    const url = offerLink(offer, data);
    if (url) { const link = node('a', 'Katso tarjous →', 'btn-primary'); link.href = url; link.rel = 'sponsored noopener'; link.setAttribute('aria-label', `Katso tarjous: ${offer.provider}, ${offer.product_name}`); item.append(link); }
    else item.append(node('p', 'Tarjouslinkki ei ole vielä saatavilla.', 'note'));
    return item;
  }
  function selectedPostcode() {
    const value = typeof postcodeInput?.value === 'string' ? postcodeInput.value.trim() : '';
    return /^[0-9]{5}$/.test(value) ? value : null;
  }
  const FUSE_RE = /^[13]x[1-9][0-9]*$/;
  const fuseText = token => token.replace('x', '×') + ' A';
  function selectedFuse() {
    const value = fuseSelect && typeof fuseSelect.value === 'string' ? fuseSelect.value : '';
    return FUSE_RE.test(value) ? value : null;
  }
  // Show exactly the main fuse the backend reports it priced with.
  function fuseNotice(data, requested) {
    const fuse = data.assumptions?.main_fuse;
    const source = data.assumptions?.main_fuse_source;
    if (typeof fuse === 'string' && FUSE_RE.test(fuse) && source === 'default' && !requested)
      return `Vertailussa oletetaan pääsulakekooksi ${fuseText(fuse)}. Tarkista sulakekokosi, sillä se voi vaikuttaa hintaan.`;
    if (typeof fuse === 'string' && source === 'user_provided' && fuse === requested)
      return `Hinnat on verrattu pääsulakkeelle ${fuseText(fuse)}.`;
    if (requested) return 'Valittua pääsulaketta ei voitu huomioida tässä vertailussa. Tarkista hinnat sähköyhtiöltä.';
    return null;
  }
  const OFFER_LIMIT = 20;
  const models = ['spot', 'fixed'];
  function sameValue(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
  }
  function comparisonLists(data) {
    // An optional extension is accepted as a whole; never repair or reorder it.
    try {
      const groups = data.comparison_offers;
      const meta = data.comparison_list_meta;
      if (data.comparison_list_status !== 'available' || !groups || !meta || meta.limit_per_group !== OFFER_LIMIT) return null;
      const identities = new Set();
      for (const model of models) {
        const rows = groups[model], top = data[`top_${model}_offers`], counts = meta[model];
        if (!Array.isArray(rows) || rows.length > OFFER_LIMIT || top.length > 3 || !sameValue(rows.slice(0, 3), top) || !counts ||
            !Number.isSafeInteger(counts.returned_count) || !Number.isSafeInteger(counts.total_count) ||
            counts.returned_count !== rows.length || counts.total_count < rows.length ||
            rows.length !== Math.min(OFFER_LIMIT, counts.total_count) ||
            counts.truncated !== (counts.total_count > rows.length)) return null;
        let previous = -Infinity;
        for (const offer of rows) {
          if (!offer || offer.type !== model || !numeric(offer.annual_cost_estimate) || offer.annual_cost_estimate < previous ||
              typeof offer.provider !== 'string' || !offer.provider.trim() ||
              typeof offer.product_name !== 'string' || !offer.product_name.trim()) return null;
          previous = offer.annual_cost_estimate;
          if (offer.id != null) {
            if (typeof offer.id !== 'string' || !offer.id || identities.has(offer.id)) return null;
            const safe = safeUrl(offer.go_url);
            if (!safe) return null;
            const link = new URL(safe);
            if (link.origin !== 'https://elecz.com' || !link.pathname.startsWith('/go/') ||
                link.searchParams.get('offer_id') !== offer.id || link.searchParams.get('zone') !== 'FI') return null;
            identities.add(offer.id);
          } else if (offer.go_url != null) return null;
        }
      }
      return { groups, meta };
    } catch { return null; }
  }
  function resetGroups() {
    for (const model of models) {
      const more = document.getElementById(`${model}-more`);
      more.hidden = true; more.disabled = true; more.onclick = null;
      more.setAttribute('aria-expanded', 'false');
      document.getElementById(`${model}-offers`).replaceChildren();
      document.getElementById(`${model}-count`).textContent = '';
      document.getElementById(`${model}-more-status`).textContent = '';
      document.getElementById(`${model}-more-note`).hidden = true;
    }
  }
  function renderGroup(model, offers, data, extension) {
    const list = document.getElementById(`${model}-offers`);
    const more = document.getElementById(`${model}-more`);
    const count = document.getElementById(`${model}-count`);
    const notice = document.getElementById(`${model}-more-note`);
    const live = document.getElementById(`${model}-more-status`);
    list.replaceChildren();
    const initial = offers.slice(0, 3);
    initial.forEach(offer => list.append(card(offer, data)));
    if (!offers.length) list.append(node('li', 'Vertailukelpoisia tarjouksia ei löytynyt tässä ryhmässä.', 'notice'));
    count.hidden = !extension || extension.meta[model].total_count === 0;
    notice.hidden = Boolean(extension);
    notice.textContent = extension ? '' : 'Lisätarjouksia ei juuri nyt saatavilla';
    if (!extension) return;
    const rows = extension.groups[model], meta = extension.meta[model];
    const updateCount = shown => {
      if (meta.total_count === 0) { count.textContent = ''; return; }
      count.textContent = meta.truncated
        ? `Näytetään ${number(shown, 0)} halvinta ${number(meta.total_count, 0)} tarjouksesta`
        : `Yhteensä ${number(meta.total_count, 0)} ${meta.total_count === 1 ? 'tarjous' : 'tarjousta'}`;
    };
    updateCount(initial.length);
    more.hidden = rows.length <= initial.length;
    more.disabled = more.hidden;
    if (!more.hidden) more.onclick = () => {
      // These cards belong to the same response; this action never fetches.
      const added = rows.slice(initial.length).map(offer => card(offer, data));
      added.forEach(item => list.append(item));
      more.hidden = true; more.disabled = true; more.onclick = null;
      more.setAttribute('aria-expanded', 'true');
      updateCount(rows.length);
      live.textContent = `Näytettiin ${number(added.length, 0)} ${added.length === 1 ? 'lisätarjous' : 'lisätarjousta'}. ${count.textContent}.`;
      added[0].children[0].focus();
    };
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const valid = form.reportValidity();
    if (!valid) return;
    const rawConsumption = input.value.trim();
    const consumption = rawConsumption === '' ? null : Number(rawConsumption);
    if (consumption !== null && (!Number.isSafeInteger(consumption) || consumption <= 0)) {
      input.setCustomValidity('Anna vuosikulutus positiivisena kokonaislukuna.'); input.reportValidity(); return;
    }
    resetGroups();
    button.disabled = true; input.disabled = true; if (fuseSelect) fuseSelect.disabled = true; results.hidden = true;
    updateStepButtons();
    housingSelect.disabled = true;
    if (postcodeInput) postcodeInput.disabled = true;
    results.setAttribute('aria-busy', 'true'); status.className = ''; status.textContent = 'Haetaan sähkösopimuksia…';
    const controller = new AbortController();
    const slowMessage = setTimeout(() => { status.textContent = 'Haetaan sähkösopimuksia… Haku voi kestää hetken.'; }, 5000);
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const query = new URLSearchParams({ zone: 'FI', offer_limit: String(OFFER_LIMIT) });
      const requested = { profile: estimatedProfile, consumption: consumptionOrigin === 'user' ? consumption : null };
      if (requested.profile) query.set('housing_profile', requested.profile);
      else if (requested.consumption !== null) query.set('consumption', String(requested.consumption));
      // Empty and malformed postcodes use the existing national-only comparison.
      const requestedPostcode = selectedPostcode();
      if (requestedPostcode) query.set('postcode', requestedPostcode);
      const requestedFuse = selectedFuse();
      if (requestedFuse) query.set('fuse', requestedFuse);
      const response = await fetch(`/signal/contract?${query}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('http');
      const data = await response.json();
      if (data.zone !== 'FI' || data.currency !== 'EUR' || data.contract_comparison !== 'available' || !Array.isArray(data.top_spot_offers) || !Array.isArray(data.top_fixed_offers)) throw new Error('schema');
      const summary = consumptionSummary(data, requested);
      const extension = comparisonLists(data);
      renderGroup('spot', data.top_spot_offers, data, extension);
      renderGroup('fixed', data.top_fixed_offers, data, extension);
      document.getElementById('result-heading').textContent = summary.text;
      const sourceLink = document.getElementById('consumption-source');
      sourceLink.replaceChildren();
      sourceLink.hidden = !summary.sourceUrl;
      if (summary.sourceUrl) {
        const link = node('a', 'Kulutusarvion lähde: Energiaviraston Sähkönhinta.fi');
        link.href = summary.sourceUrl;
        sourceLink.append(link);
      }
      const postcodeNotice = document.getElementById('postcode-notice');
      postcodeNotice.textContent = requestedPostcode ? '' : 'Vertailussa ovat vain valtakunnalliset tarjoukset. Alueelliset tarjoukset eivät ole mukana ilman viisinumeroista postinumeroa.';
      postcodeNotice.hidden = Boolean(requestedPostcode);
      let meta = 'Tarjoukset ovat vertailumoottorin hintajärjestyksessä. Aluksi näytetään enintään kolme tarjousta kummastakin ryhmästä.';
      const timestamp = new Date(data.timestamp);
      if (data.timestamp && Number.isFinite(timestamp.getTime())) meta += ` Vertailu laskettu ${new Intl.DateTimeFormat('fi-FI', { dateStyle: 'short', timeZone: 'Europe/Helsinki' }).format(timestamp)} klo ${new Intl.DateTimeFormat('fi-FI', { timeStyle: 'short', timeZone: 'Europe/Helsinki' }).format(timestamp)} (Suomen aikaa). Sopimusaineiston päivitysaika ei ole saatavilla tässä vastauksessa.`;
      document.getElementById('result-meta').textContent = meta;
      const notice = document.getElementById('fuse-notice');
      const noticeText = fuseNotice(data, requestedFuse);
      notice.textContent = noticeText || '';
      notice.hidden = !noticeText;
      results.hidden = false;
      status.textContent = data.top_spot_offers.length || data.top_fixed_offers.length ? 'Vertailu valmis.' : 'Vertailukelpoisia tarjouksia ei löytynyt. Voit yrittää myöhemmin uudelleen.';
      document.getElementById('result-heading').focus();
    } catch (error) {
      status.className = 'error';
      status.textContent = error.name === 'AbortError' ? 'Haku kesti liian kauan. Yritä uudelleen vertailupainikkeella.' : 'Vertailua ei voitu hakea juuri nyt. Yritä uudelleen vertailupainikkeella.';
    } finally {
      clearTimeout(timeout); clearTimeout(slowMessage); button.disabled = false; input.disabled = false; if (fuseSelect) fuseSelect.disabled = false; results.setAttribute('aria-busy', 'false');
      if (postcodeInput) postcodeInput.disabled = false;
      housingSelect.disabled = false;
      updateStepButtons();
    }
  });
  restoreFormState();
})();
