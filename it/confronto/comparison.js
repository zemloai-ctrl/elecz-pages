const form = document.querySelector('#comparison');
const profile = document.querySelector('#profile');
const bands = document.querySelector('#bands');
const status = document.querySelector('#status');
const snapshot = document.querySelector('#snapshot');
const list = document.querySelector('#offers');
const more = document.querySelector('#more');
const submit = form.querySelector('button[type=submit]');
const money = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const rate = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 8 });
const date = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeZone: 'Europe/Rome' });
const labels = { energy: 'Energia', fixed_fee: 'Quota fissa', dispatching: 'Dispacciamento', demand_charge: 'Quota potenza', regulated_component: 'Componente regolata' };
const units = { PER_KWH: '€/kWh', PER_MONTH: '€/mese', PER_YEAR: '€/anno', PER_KW: '€/kW' };
let offers = [];

function node(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

function renderOffer(offer) {
  const item = document.createElement('li');
  const card = document.createElement('article');
  const details = document.createElement('details');
  const breakdown = document.createElement('ul');
  for (const entry of offer.breakdown) {
    const price = entry.amount == null || !units[entry.unit] ? '' : ' · ' + rate.format(entry.amount) + ' ' + units[entry.unit];
    const band = entry.band ? ' ' + entry.band : '';
    breakdown.append(node('li', (labels[entry.type] || 'Altra componente') + band + price + ' · ' + money.format(entry.annual_cost) + '/anno'));
  }
  details.append(node('summary', 'Dettaglio della stima'), breakdown);
  if (offer.valid_until) details.append(node('p', 'Offerta valida fino al ' + date.format(new Date(offer.valid_until))));
  if (offer.duration_months) details.append(node('p', 'Durata contrattuale: ' + offer.duration_months + ' mesi'));
  details.append(node('p', 'Codice offerta Portale Offerte: ' + offer.source_offer_id));
  const tariff = offer.breakdown.some(entry => entry.band) ? 'per fasce' : 'monoraria';
  card.append(node('h3', offer.name), node('p', offer.supplier + ' · Prezzo fisso · Tariffa ' + tariff),
    node('p', money.format(offer.annual_cost) + '/anno, imposte e oneri di rete esclusi'), details);
  item.append(card);
  return item;
}

function showMore() {
  const start = list.children.length;
  for (const offer of offers.slice(start, start + 3)) list.append(renderOffer(offer));
  more.hidden = list.children.length >= offers.length;
  if (start && list.children[start]) {
    list.children[start].tabIndex = -1;
    list.children[start].focus();
  }
}

profile.addEventListener('change', () => {
  bands.hidden = bands.disabled = profile.value !== 'custom';
});
more.addEventListener('click', showMore);

form.addEventListener('submit', async event => {
  event.preventDefault();
  const values = new FormData(form);
  const percentages = bands.disabled ? null : ['f1', 'f2', 'f3'].map(key => Number(values.get(key)));
  if (percentages && Math.abs(percentages.reduce((sum, value) => sum + value, 0) - 100) > 1e-8) {
    status.textContent = 'Le percentuali F1, F2 e F3 devono sommare al 100%.';
    form.elements.f1.focus();
    return;
  }
  list.replaceChildren();
  more.hidden = true;
  snapshot.textContent = '';
  status.textContent = 'Ricerca delle offerte in corso…';
  submit.disabled = true;
  try {
    const response = await fetch('./api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        annual_consumption_kwh: Number(values.get('consumption')),
        power_kw: Number(values.get('power')),
        band_percentages: percentages,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('comparison unavailable');
    const result = await response.json();
    offers = result.offers;
    showMore();
    status.textContent = offers.length ? result.total + ' offerte confrontabili.' : 'Nessuna offerta confrontabile per questi dati.';
    if (result.total > offers.length) status.textContent += ' Sono disponibili le prime ' + offers.length + '.';
    snapshot.textContent = 'Dati del ' + date.format(new Date(result.published_at)) +
      ' · F1/F2/F3: ' + result.band_percentages.join('% / ') + '%' +
      (result.freshness === 'aging' ? ' · Aggiornamento in attesa' : '');
  } catch {
    list.replaceChildren();
    more.hidden = true;
    status.textContent = 'Il confronto è temporaneamente indisponibile. Riprova tra poco.';
  } finally {
    submit.disabled = false;
  }
});
