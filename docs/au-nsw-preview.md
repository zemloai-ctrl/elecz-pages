# NSW consumer comparison preview

## Scope and API

New buildless `au/index.html` and `au/compare/index.html`, Australian English. Reuse the existing Italian comparison stylesheet, shared legal layout and locally hosted DM Sans fonts; AU-only additions live in `au/comparison.css`. No Finnish/Italian page, existing worker, redirect, navigation, sitemap or llms file changes.

The form calls only same-origin `GET /signal/contract`, through the existing Pages worker/redirect proxy. Parameters verified against Core: `zone=AU-NSW`, four-digit string `postcode`, integer `consumption` (1–200000), optional `meter_type`, optional exact `distributor`. Known meter labels are Type 0/4/4a/5/6; the default is unknown, never an inferred type. Exact distributor options come from API responses; changing postcode clears them. This is a household/supplier-change comparison. No affiliate links, new data store, browser pricing, GST calculation or client eligibility algorithm.

Current offer projection supplies supplier, name, source_offer_id, annual_supply_cost_aud and pricing_model. It does **not** supply separate usage rates/daily supply charges, so the page does not invent or back-calculate them. Amounts are formatted in AUD, labelled annual estimates including GST, not guaranteed bills. API ordering is retained. No market-wide cheapest or savings claim.

`all_listed` requires the matching common_eligible_offers scope, a nonempty source notice and multiple returned options. The fixed requested explanation appears visibly before the recommendation, and the exact API notice is available under “Full comparison scope”. The recommendation is labelled lowest estimate in the shared set. Exact-network refinement remains optional. Empty safe sets show needs_distributor, original choices and resolution.message; a subsequent request uses the exact selected source label. Unknown/malformed scope, stale/unavailable freshness, unsupported market/currency/cost scope, inconsistent recommendation or malformed price yields no offer cards.

Form validity, empty results, disabled legacy AU response, source expiry, invalid distributor, HTTP 400/422/503, network errors and a 20-second browser deadline have distinct safe states. No automatic retries. This browser deadline does not change Core/Contracts timeouts. A changed field aborts/invalidates a pending request and removes previous results; late responses cannot overwrite edited input. All API text uses textContent, not innerHTML. No initial API request or test data is loaded on page open.

## Publication safety

Both new pages retain `noindex, nofollow` and a prominent “NSW electricity plan comparison is not yet publicly available.” notice. The comparison form is a preview/check-availability flow. A disabled API produces that same notice, no prices, no recommendation and no success message. Neither page is linked from existing public navigation, sitemap, llms, hreflang or JSON-LD discovery. There is no offer schema or invented review/rating/count data.

This is a Draft PR only. **Merging main is a public release.** Do not merge while treating it as a harmless source-only action. The automatic branch preview is authorized for review; no manual deployment or Cloudflare/DNS/configuration change is performed.

## Verified current Cloudflare Pages chain (read-only, 25 November 2026)

- Project `elecz-pages-git`, GitHub source `zemloai-ctrl/elecz-pages`.
- Production branch main, production deployments enabled.
- Preview setting all, includes `*`, excludes none.
- Empty build command/root/output fields: static files served from the repository root, with existing `_worker.js` advanced-mode routing.
- Domains elecz.com, www.elecz.com and elecz-pages-git.pages.dev.
- Existing `/signal/*` routing forwards to the Core origin; the worker caches successful responses for 300 seconds by complete URL/query. No new route, bypass or cache setting is added here. Disabled responses may therefore remain cached briefly after a future activation.
- There was no existing GitHub Actions workflow or package build/test runner. This PR adds a narrowly triggered, read-only Actions workflow for existing offline regressions plus AU tests and fixture-only AU/Italian browser tests. It does not deploy. Cloudflare's GitHub integration alone creates the branch preview.

## Tests and screenshots

Run offline regressions with Node24, excluding the two stdin validators that require a supplied Core response:

```sh
files=()
for file in tests/*.cjs; do
  case "$file" in tests/fi-core-consumption-response.cjs|tests/fi-cross-repo-contract.cjs) continue ;; esac
  files+=("$file")
done
node --test "${files[@]}"
```

Local result: **128 passed, 0 failed**. The stdin validators are not standalone tests and no production response is fetched to feed them.

Browser harness follows `tests/it-comparison-browser.py`. It tests 320×740, 375×812 and 1440×1000, with all Core calls mocked and all external origins blocked. It verifies 2000/single network, 2650/common and exact selection, needs_distributor/retry, invalid postcode, empty/stale/disabled responses, HTTP/network failures, safe API text and horizontal overflow. Timeout/cancellation/late-response behavior is covered by deterministic offline tests. Existing Italian browser regressions run unchanged in CI.

`tests/fixtures/au-responses.json` contains explicitly synthetic names/prices. It is imported by tests only, never by the page. Common-result screenshots get an additional “SYNTHETIC TEST RESPONSE — NOT A LIVE OFFER” banner from the test harness. Screenshots are stored in the CI `au-nsw-screenshots` artifact (30 days); they are test evidence, not a source of live prices or public offer content.

To reproduce browser tests with installed Python Playwright/Chromium:

```sh
SCREENSHOT_DIR=artifacts/au-screenshots python tests/au-comparison-browser.py
python tests/it-comparison-browser.py
```

`PREVIEW_ORIGIN=http://127.0.0.1:PORT` optionally reuses an existing local static preview. The browser harness refuses a remote preview for this option. This executor's Chromium launcher lacks its binary; browser UI was reviewed using the available managed preview/browser, and the automated width/scenario matrix runs in GitHub CI with a bundled browser. No local hosting manifest, copied preview output or development server configuration is included in the PR.

## Separate launch checklist — not performed by this PR

1. Claude reviews this PR, fixtures/CI and scope notices; Sakke separately approves a public release. Pages merge itself publishes, so coordinate release order explicitly.
2. Separately approve/enable Core's AU feature and rebuild/deploy Core under the existing procedure. Do not activate it from Pages. Allow the existing response cache to expire or separately approve a targeted cache action if needed.
3. Verify through same-origin `/signal/contract` the single-network, all_listed, explicit-network and empty-common-set states, missing-scope safety, freshness and GST/AUD amounts. Check mobile and keyboard behavior against the actual API. No browser-side fallback should make a disabled API look live.
4. In a separately approved release change, update/remove preview availability wording and noindex only when the service is actually public. Then decide navigation, sitemap, llms, hreflang/canonical and other discovery additions. None is included here.
5. Review AU-facing terms/privacy/methodology wording and data coverage before public promotion. Existing English site policy links are reused; this PR does not invent AU-specific legal terms or launch dates.
6. Other states/territories and affiliate integrations remain separate work. “Coming later” is not a date commitment.
