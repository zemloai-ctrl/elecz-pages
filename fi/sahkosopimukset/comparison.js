'use strict';
(() => {
  const form = document.getElementById('comparison-form');
  const input = document.getElementById('consumption');
  const button = form.querySelector('button');
  const status = document.getElementById('status');
  const results = document.getElementById('results');
  const number = (value, digits = 2) => new Intl.NumberFormat('fi-FI', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
  const numeric = value => typeof value === 'number' && Number.isFinite(value);
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
  function offerLink(offer, data) {
    // Only the recommended offer has an authoritative execution URL today.
    // Never construct /go/ IDs from provider names, or reuse the winner's link.
    const recommended = data.recommended?.contract;
    if (recommended && JSON.stringify(offer) === JSON.stringify(recommended) && data.action?.available === true) {
      const action = safeUrl(data.action.action_link);
      if (action && new URL(action).origin === 'https://elecz.com' && new URL(action).pathname.startsWith('/go/')) return action;
    }
    return safeUrl(offer.affiliate_url) || safeUrl(offer.direct_url);
  }
  function card(offer, data) {
    const item = node('li', undefined, 'offer');
    item.append(node('h3', offer.provider || 'Toimittaja ei saatavilla'), node('p', offer.product_name || 'Tuotenimi ei saatavilla', 'product'));
    if (offer.new_customers_only === true) item.append(node('p', 'Vain uusille asiakkaille', 'badge'));
    item.append(node('p', numeric(offer.annual_cost_estimate) ? `${number(offer.annual_cost_estimate)} €` : 'Arvio ei saatavilla', 'price'), node('p', 'Arvio / ensimmäiset 12 sopimuskuukautta', 'price-label'));
    const details = node('dl');
    const row = (label, value) => { const div = node('div'); div.append(node('dt', label), node('dd', value)); details.append(div); };
    if (numeric(offer.spot_margin_ckwh)) row('Pörssimarginaali', `${number(offer.spot_margin_ckwh, 4).replace(/0+$/, '').replace(/,$/, '')} snt/kWh`);
    if (numeric(offer.fixed_price_ckwh)) row('Energiahinta', `${number(offer.fixed_price_ckwh)} snt/kWh`);
    row('Kuukausimaksu', numeric(offer.basic_fee_eur_month) ? `${number(offer.basic_fee_eur_month)} €/kk` : 'Yhtä kuukausisummaa ei saatavilla');
    row('Sopimuksen kesto', numeric(offer.contract_duration_months) && offer.contract_duration_months > 0 ? `${number(offer.contract_duration_months, 0)} kk` : 'Ei saatavilla – tarkista ehdot');
    if (offer.price_includes_tax === true) row('Arvonlisävero', 'Sisältyy hintoihin');
    item.append(details);
    const url = offerLink(offer, data);
    if (url) { const link = node('a', 'Katso tarjous →', 'btn-primary'); link.href = url; link.rel = 'sponsored noopener'; link.setAttribute('aria-label', `Katso tarjous: ${offer.provider}, ${offer.product_name}`); item.append(link); }
    else item.append(node('p', 'Tarjouslinkki ei ole vielä saatavilla.', 'note'));
    return item;
  }
  function renderGroup(id, offers, data) {
    const list = document.getElementById(id);
    list.replaceChildren();
    // Preserve server order and eligibility; only cap the display at three.
    offers.slice(0, 3).forEach(offer => list.append(card(offer, data)));
    if (!offers.length) list.append(node('li', 'Vertailukelpoisia tarjouksia ei löytynyt tässä ryhmässä.', 'notice'));
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const consumption = Number(input.value);
    if (!Number.isSafeInteger(consumption) || consumption <= 0) {
      input.setCustomValidity('Anna vuosikulutus positiivisena kokonaislukuna.'); input.reportValidity(); return;
    }
    button.disabled = true; input.disabled = true; results.hidden = true;
    results.setAttribute('aria-busy', 'true'); status.className = ''; status.textContent = 'Haetaan sähkösopimuksia…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const query = new URLSearchParams({ zone: 'FI', consumption: String(consumption) });
      const response = await fetch(`/signal/contract?${query}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('http');
      const data = await response.json();
      if (data.zone !== 'FI' || data.currency !== 'EUR' || data.contract_comparison !== 'available' || !Array.isArray(data.top_spot_offers) || !Array.isArray(data.top_fixed_offers)) throw new Error('schema');
      if (data.assumptions?.annual_consumption_kwh !== consumption) throw new Error('consumption');
      renderGroup('spot-offers', data.top_spot_offers, data);
      renderGroup('fixed-offers', data.top_fixed_offers, data);
      document.getElementById('result-heading').textContent = `Vertailu: ${number(consumption, 0)} kWh / vuosi`;
      let meta = 'Enintään kolme tarjousta kummassakin ryhmässä, vertailumoottorin järjestyksessä.';
      const timestamp = new Date(data.timestamp);
      if (data.timestamp && Number.isFinite(timestamp.getTime())) meta += ` Vertailuvastaus ${new Intl.DateTimeFormat('fi-FI', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Helsinki' }).format(timestamp)} (Suomen aikaa).`;
      document.getElementById('result-meta').textContent = meta;
      results.hidden = false;
      status.textContent = data.top_spot_offers.length || data.top_fixed_offers.length ? 'Vertailu valmis.' : 'Vertailukelpoisia tarjouksia ei löytynyt. Voit yrittää myöhemmin uudelleen.';
      document.getElementById('result-heading').focus();
    } catch (error) {
      status.className = 'error';
      status.textContent = error.name === 'AbortError' ? 'Haku kesti liian kauan. Yritä uudelleen vertailupainikkeella.' : 'Vertailua ei voitu hakea juuri nyt. Yritä uudelleen vertailupainikkeella.';
    } finally {
      clearTimeout(timeout); button.disabled = false; input.disabled = false; results.setAttribute('aria-busy', 'false');
    }
  });
  input.addEventListener('input', () => input.setCustomValidity(''));
})();
