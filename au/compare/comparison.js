'use strict';
const form = document.querySelector('#comparison-form');
const status = document.querySelector('#comparison-status');
const result = document.querySelector('#comparison-result');
const postcode = document.querySelector('#postcode');
const consumption = document.querySelector('#consumption');
const meter = document.querySelector('#meter-type');
const distributor = document.querySelector('#distributor');
const button = document.querySelector('#compare-button');
const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', currencyDisplay: 'code' });
const UNAVAILABLE = 'NSW electricity plan comparison is not yet publicly available.';
const SHARED = 'This comparison includes plans available across all listed distributor options for your postcode. Selecting your exact distributor may reveal additional or cheaper plans.';
const METER_TYPES = new Set(['', 'Type 0', 'Type 4', 'Type 4a', 'Type 5', 'Type 6']);
let active;
let requestNumber = 0;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function setOptions(options, selected = distributor.value) {
  const choices = Array.isArray(options) ? [...new Set(options.filter(value =>
    typeof value === 'string' && value.trim() && value.length <= 300))].slice(0, 20) : [];
  distributor.replaceChildren(node('option', 'Not sure — check without a selection'));
  distributor.children[0].value = '';
  for (const choice of choices) {
    const option = node('option', choice);
    option.value = choice;
    distributor.append(option);
  }
  distributor.value = choices.includes(selected) ? selected : '';
  return choices;
}

function validOffer(offer) {
  return offer && typeof offer.supplier === 'string' && offer.supplier.trim() &&
    typeof offer.source_offer_id === 'string' && offer.source_offer_id.trim() &&
    typeof offer.annual_supply_cost_aud === 'number' && Number.isFinite(offer.annual_supply_cost_aud) &&
    offer.annual_supply_cost_aud >= 0;
}

function offerCard(offer, recommended, shared) {
  const card = node('article', undefined, 'offer' + (recommended ? ' recommended' : ''));
  if (recommended) card.append(node('p', shared ? 'Lowest estimate in the shared plan set' : 'Lowest estimate in this comparison'));
  card.append(node('h3', offer.supplier));
  card.append(node('p', typeof offer.name === 'string' && offer.name.trim() ? offer.name : 'Plan name not provided'));
  card.append(node('p', money.format(offer.annual_supply_cost_aud) + ' / year', 'price'));
  card.append(node('p', 'Estimated annual supply cost · includes GST', 'estimate'));
  if (Number.isSafeInteger(offer.variant_count) && offer.variant_count > 1) {
    card.append(node('p', '+' + (offer.variant_count - 1) + ' identical-price plan variants', 'estimate'));
  }
  return card;
}

function dataUnavailable() {
  status.textContent = 'A reliable comparison is unavailable or the plan data is out of date. No plans can be recommended. Please try again later.';
}

function render(data, input) {
  result.replaceChildren();
  if (!data || typeof data !== 'object') { dataUnavailable(); return; }
  const state = data.contract_comparison;
  const options = setOptions(data.distributors);
  if (state === 'not_available') {
    if (['snapshot_unavailable', 'market_data_unavailable', 'invalid_contracts_response'].includes(data.reason)) dataUnavailable();
    else if (['state_not_supported', 'market_not_supported', 'postcode_not_supported'].includes(data.reason)) status.textContent = 'Only New South Wales is supported. A comparison is not available for this postcode.';
    else if (data.reason === 'postcode_required') status.textContent = 'Enter a valid four-digit Australian postcode.';
    else if (data.reason === 'invalid_consumption') status.textContent = 'Enter annual electricity use between 1 and 200,000 kWh.';
    else status.textContent = UNAVAILABLE;
    return;
  }
  if (state === 'needs_distributor' || state === 'invalid_distributor') {
    if (!options.length) { dataUnavailable(); return; }
    status.textContent = state === 'needs_distributor'
      ? 'No safe shared comparison is available. Confirm your exact distributor or tariff area, then check again.'
      : 'That distributor option is not available for these details. Choose a confirmed option from the list and check again.';
    const details = document.querySelector('.refinements');
    details.open = true;
    const guidance = data.distributor_resolution;
    if (guidance && typeof guidance.message === 'string') result.append(node('p', guidance.message, 'scope'));
    distributor.focus();
    return;
  }
  if (state === 'insufficient_data') {
    status.textContent = 'No comparable plans were returned for these details. You can try a confirmed meter type or exact distributor, if you know them.';
    return;
  }
  if (state !== 'available' || data.market !== 'AU_NSW' || data.currency !== 'AUD' ||
      data.cost_scope !== 'annual_electricity_supply_including_gst' ||
      (data.freshness !== undefined && !['fresh', 'aging'].includes(data.freshness)) ||
      (data.postcode !== undefined && data.postcode !== input.postcode) ||
      (data.annual_consumption_kwh !== undefined && data.annual_consumption_kwh !== input.consumption)) {
    dataUnavailable(); return;
  }
  const shared = data.distributor_scope === 'all_listed';
  if ((data.distributor_scope !== undefined && !shared) ||
      (data.comparison_scope !== undefined && (!shared || data.comparison_scope !== 'common_eligible_offers')) ||
      (shared && (data.comparison_scope !== 'common_eligible_offers' || options.length < 2 ||
       typeof data.distributor_notice !== 'string' || !data.distributor_notice.trim()))) {
    dataUnavailable(); return;
  }
  if (!Array.isArray(data.offers) || !data.offers.length) {
    status.textContent = 'No comparable plans were returned for these details.'; return;
  }
  if (!data.offers.every(validOffer) || (data.recommended != null &&
      (!validOffer(data.recommended) || data.recommended.source_offer_id !== data.offers[0].source_offer_id ||
       data.recommended.annual_supply_cost_aud !== data.offers[0].annual_supply_cost_aud ||
       data.recommended.supplier !== data.offers[0].supplier))) {
    dataUnavailable(); return;
  }
  if (shared) {
    const scope = node('aside', undefined, 'scope');
    scope.append(node('h3', 'A shared set of plans'));
    scope.append(node('p', SHARED));
    const detail = node('details');
    detail.append(node('summary', 'Full comparison scope'), node('p', data.distributor_notice));
    scope.append(detail);
    result.append(scope);
  } else if (typeof data.distributor === 'string') {
    result.append(node('p', 'Distributor or tariff area: ' + data.distributor));
  }
  status.textContent = shared ? 'Estimates for the common plan set — not the whole postcode market.' : 'Estimates for the plans returned by the comparison service.';
  if (data.freshness === 'aging') result.append(node('p', 'Plan data is ageing. Confirm current pricing and terms with the retailer.'));
  if (typeof data.meter_limitation === 'string') result.append(node('p', data.meter_limitation));
  const cards = node('div', undefined, 'offers');
  data.offers.forEach((offer, index) => cards.append(offerCard(offer, index === 0 && data.recommended != null, shared)));
  result.append(cards);
  if (Number.isInteger(data.omitted_offers) && data.omitted_offers > 0) result.append(node('p', 'Some plans could not be shown because their data is incomplete.'));
}

function invalidate(clearNetworks = false) {
  requestNumber++;
  if (active) active.abort();
  result.replaceChildren();
  if (clearNetworks) setOptions([]);
  status.textContent = 'Your details changed. Check again for an updated comparison.';
  button.disabled = false;
  form.setAttribute('aria-busy', 'false');
}

async function submit(event) {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (!/^[0-9]{4}$/.test(postcode.value) || !Number.isInteger(Number(consumption.value)) ||
      Number(consumption.value) < 1 || Number(consumption.value) > 200000 || !METER_TYPES.has(meter.value)) {
    result.replaceChildren(); status.textContent = 'Enter a four-digit postcode and annual electricity use between 1 and 200,000 kWh.'; return;
  }
  if (active) active.abort();
  const current = ++requestNumber;
  const controller = new AbortController();
  active = controller;
  const input = { postcode: postcode.value, consumption: Number(consumption.value) };
  const query = new URLSearchParams({ zone: 'AU-NSW', postcode: input.postcode, consumption: String(input.consumption) });
  if (meter.value) query.set('meter_type', meter.value);
  if (distributor.value) query.set('distributor', distributor.value);
  result.replaceChildren();
  status.textContent = 'Checking comparison availability…';
  button.disabled = true;
  form.setAttribute('aria-busy', 'true');
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('/signal/contract?' + query, { signal: controller.signal, credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!response.ok) {
      if (current === requestNumber) status.textContent = response.status === 400 || response.status === 422
        ? 'These details could not be accepted. Check your postcode, annual use and distributor option.'
        : 'The comparison service is temporarily unavailable. Please try again later.';
      return;
    }
    const data = await response.json();
    if (current === requestNumber) render(data, input);
  } catch (error) {
    if (current === requestNumber) status.textContent = error.name === 'AbortError'
      ? 'The comparison request timed out. No plans can be recommended. Please try again.'
      : 'The comparison service is temporarily unavailable. Please try again later.';
  } finally {
    clearTimeout(timer);
    if (current === requestNumber) { button.disabled = false; form.setAttribute('aria-busy', 'false'); active = null; }
  }
}

if (form) {
  form.hidden = false;
  form.addEventListener('submit', submit);
  postcode.addEventListener('input', () => invalidate(true));
  consumption.addEventListener('input', () => invalidate());
  for (const field of [meter, distributor]) field.addEventListener('change', () => invalidate());
}
