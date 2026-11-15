'use strict';

const form = document.querySelector('#comparison-form');
const status = document.querySelector('#comparison-status');
const result = document.querySelector('#comparison-result');
const number = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

const messages = {
  recommended: 'Offerta consigliata tra quelle confrontate.',
  cost_tie: 'Le offerte mostrate hanno costi simili. Nessuna offerta è consigliata.',
  depends_on_pun: 'L’offerta più conveniente dipende dal PUN futuro. Nessuna offerta è consigliata.',
  partial_coverage: 'La copertura è parziale: alcune offerte escluse potrebbero essere più convenienti. Nessuna offerta è consigliata.',
  insufficient_data: 'I dati disponibili non consentono un confronto attendibile.',
  no_eligible_offers: 'Non risultano offerte idonee per il profilo considerato.',
};

const partialReasons = {
  band_priced_offers_not_compared: 'Alcune offerte indicizzate con prezzi per fascia non sono state calcolate.',
  eligibility_uncertain_offers_not_compared: 'Alcune offerte potrebbero essere riservate a gruppi, clienti esistenti o a chi acquista un altro prodotto.',
  eligibility_unknown_offers_not_compared: 'Per alcune offerte non è possibile confermare le condizioni di accesso.',
  regional_offers_not_compared: 'Alcune offerte sono disponibili solo in determinate regioni.',
};

const coverageReasons = {
  restricted: 'Offerte riservate',
  not_eligible: 'Requisiti non soddisfatti',
  eligibility_uncertain: 'Possibili limitazioni da verificare',
  regional_only: 'Disponibilità limitata per area',
  eligibility_unknown: 'Requisiti non verificabili',
  incomplete_offer: 'Dati dell’offerta incompleti',
  price_term_under_12_months: 'Condizioni di prezzo senza copertura di 12 mesi',
  unsupported_pricing_model: 'Modello tariffario non supportato',
  unsupported_price_structure_fixed: 'Struttura a prezzo fisso non supportata',
  unsupported_price_structure_indexed: 'Struttura indicizzata non supportata',
  missing_pricing_data: 'Dati di prezzo insufficienti',
  unidentified_supplier: 'Venditore non identificato',
};

const offerLinkLabels = {
  offer_page: 'Pagina dell’offerta',
  supplier_offers_page: 'Offerte del venditore',
  supplier_homepage: 'Sito del venditore',
};

const disclosures = {
  security_deposit: 'Il venditore può richiedere un deposito cauzionale rimborsabile.',
  security_deposit_unless_direct_debit: 'È previsto un deposito cauzionale rimborsabile salvo pagamento con addebito diretto (SDD).',
};

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function isRange(value) {
  return value && Number.isFinite(value.min) && Number.isFinite(value.max) && value.min <= value.max;
}

function offerLink(link) {
  if (!link || !Object.hasOwn(offerLinkLabels, link.kind) || typeof link.url !== 'string' ||
      !link.url.startsWith('https://')) return null;
  let url;
  try {
    url = new URL(link.url);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;

  const anchor = node('a', offerLinkLabels[link.kind]);
  anchor.href = url.href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer nofollow';
  return anchor;
}

function offerCard(offer) {
  if (!offer || typeof offer.name !== 'string' || !offer.name.trim() ||
      typeof offer.provider !== 'string' || !offer.provider.trim()) return null;
  const cost = offer.annual_supply_cost_eur;
  let label;
  let price;
  if (offer.contract_type === 'fixed' && Number.isFinite(cost) && cost >= 0) {
    label = 'Prezzo fisso';
    price = `${money.format(cost)} / anno · stima`;
  } else if (offer.contract_type === 'pun_indexed' && isRange(cost) && cost.min >= 0) {
    label = 'Prezzo indicizzato al PUN';
    price = `${money.format(cost.min)} – ${money.format(cost.max)} / anno · scenari storici`;
  } else {
    return null;
  }
  const card = node('article', '', 'offer');
  card.append(node('p', label), node('h4', offer.name), node('p', offer.provider), node('p', price, 'price'));
  if (typeof offer.offer_code === 'string' && offer.offer_code) card.append(node('p', `Codice offerta: ${offer.offer_code}`));
  const conditions = Array.isArray(offer.conditions_to_disclose) ? offer.conditions_to_disclose : [];
  for (const condition of conditions) {
    if (Object.hasOwn(disclosures, condition?.code)) card.append(node('p', disclosures[condition.code]));
  }
  const link = offerLink(offer.link);
  if (link) {
    const action = node('p');
    action.append(link);
    card.append(action);
  }
  return card;
}

function renderCoverage(coverage) {
  if (coverage?.scope !== 'household_offers_in_snapshot' ||
      !Number.isInteger(coverage.household_offers) || !Number.isInteger(coverage.compared_offers) ||
      coverage.compared_offers < 0 || coverage.compared_offers > coverage.household_offers) return;

  const summary = `Copertura: ${number.format(coverage.compared_offers)} di ${number.format(coverage.household_offers)} offerte domestiche nel dataset`;
  const exclusions = node('ul');
  for (const [key, label] of Object.entries(coverageReasons)) {
    const count = coverage.not_compared_by_reason?.[key];
    if (Number.isInteger(count) && count > 0) exclusions.append(node('li', `${label}: ${number.format(count)}`));
  }
  if (!exclusions.childElementCount) {
    result.append(node('p', summary));
    return;
  }
  const details = node('details', '', 'coverage');
  details.append(node('summary', summary), exclusions);
  result.append(details);
}

function render(data, consumption) {
  if (data?.contract_comparison !== 'available') {
    status.textContent = data?.contract_comparison === 'not_available'
      ? 'Il confronto delle offerte luce in Italia non è ancora disponibile.'
      : 'Il confronto è temporaneamente indisponibile. Riprova più tardi.';
    return;
  }

  if (data.market !== 'IT' || data.cost_scope !== 'electricity_sales_only' ||
      !Object.hasOwn(messages, data.comparison_state)) {
    status.textContent = messages.insufficient_data;
    return;
  }

  const state = data.comparison_state;
  const tied = Array.isArray(data.tied_offers) ? data.tied_offers : [];
  let offers = [];
  if (state === 'recommended') offers = [data.recommended];
  if (state === 'cost_tie') offers = tied;
  if (state === 'depends_on_pun' || state === 'partial_coverage') {
    offers = [data.best_fixed, data.best_indexed].filter(Boolean);
  }
  const cards = offers.map(offerCard).filter(Boolean);
  if (!cards.length && state === 'recommended') {
    status.textContent = messages.insufficient_data;
    renderCoverage(data.coverage);
    return;
  }
  status.textContent = messages[state];
  if (state === 'partial_coverage') {
    const reasons = new Set(Array.isArray(data.partial_reasons) ? data.partial_reasons : []);
    reasons.add(data.reason);
    const list = node('ul');
    for (const reason of reasons) {
      if (Object.hasOwn(partialReasons, reason)) list.append(node('li', partialReasons[reason]));
    }
    if (list.childElementCount) result.append(list);
  }

  if (cards.length) {
    const grid = node('div', '', 'offers');
    grid.append(...cards);
    result.append(node('p', 'Consumo considerato: ' + number.format(consumption) + ' kWh/anno.'));
    result.append(node('h3', state === 'recommended' ? 'Offerta consigliata' : 'Offerte nel confronto'), grid);
  }
  if (state === 'depends_on_pun' && cards.length === 2 && Number.isFinite(data.break_even_pun_eur_mwh)) {
    result.append(node('p', `PUN di pareggio: ${number.format(data.break_even_pun_eur_mwh)} €/MWh. A questo valore le due offerte mostrate hanno lo stesso costo annuo di vendita stimato.`));
  }
  if (data.reason === 'indexed_winner_changes_across_history' && cards.length) {
    result.append(node('p', 'L’offerta indicizzata più conveniente può cambiare al variare del PUN.'));
  }
  if (cards.length && isRange(data.historical_pun_range_eur_mwh)) {
    const range = data.historical_pun_range_eur_mwh;
    result.append(node('p', `PUN negli scenari storici: ${number.format(range.min)} – ${number.format(range.max)} €/MWh.`));
  }
  renderCoverage(data.coverage);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const button = form.querySelector('button');
  const consumption = form.elements.consumption.valueAsNumber;
  const query = new URLSearchParams({ zone: 'IT', consumption: String(consumption) });
  result.replaceChildren();
  status.textContent = 'Confronto in corso…';
  button.disabled = true;
  try {
    const response = await fetch(`/signal/contract?${query}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Comparison unavailable');
    render(await response.json(), consumption);
  } catch {
    result.replaceChildren();
    status.textContent = 'Il confronto è temporaneamente indisponibile. Riprova più tardi.';
  } finally {
    button.disabled = false;
  }
});
form.hidden = false;
