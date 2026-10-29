# Finnish comparison: optional housing estimate

The consumption input starts empty. Submitting without an own number or a profile
uses Core's existing 2,000 kWh default. The displayed result distinguishes the
server's `user_provided`, `estimated_from_housing_type`, and `zone_default` sources.

| Choice | UI autofill, kWh/year | REST parameter |
| --- | ---: | --- |
| Kerrostalo, kaukolämmitys | 2,000 | `housing_profile=fi_apartment_district_v1` |
| Pientalo ilman sähkölämmitystä | 5,500 | `housing_profile=fi_small_house_non_electric_v1` |
| Sähkölämmitteinen rivitaloasunto | 11,000 | `housing_profile=fi_terraced_electric_v1` |
| Sähkölämmitteinen omakotitalo | 18,000 | `housing_profile=fi_detached_electric_v1` |

Source: [Energiavirasto's Sähkönhinta.fi](https://www.sahkonhinta.fi/).
Core resolves the profile ID; an untouched estimate never sends `consumption`.
The small UI table only autofills and checks the returned profile amount.

## State transitions

- Selecting a profile fills its estimate and activates the profile request.
- Focusing/clicking the number does not change its origin.
- An `input` event clears the active profile and resets the profile selector.
  The edited number is sent alone as `consumption`, even if changed back to the
  original estimate. Explicitly selecting a profile again restores an estimate.
- Clearing the number removes the active profile; a blank request sends neither
  parameter. Blank is handled before numeric conversion, so it never becomes zero.
- Deselecting a profile clears its autofill but preserves a manually edited number.
- `Muu kohde (esim. maatila tai suuri kiinteistö)` supplies no estimate. It asks for
  the property's own consumption and main fuse. Switching to it clears an active
  estimate and preserves a manual number. Blank remains allowed, with an explicit
  explanation that the general 2,000 kWh default is not a farm/large-property estimate.

The fuse selector remains visible and is never inferred or changed from housing.
Moving it into additional details is a separate future change. Optional postcode
validation and national-only fallback are unchanged.

## Result provenance

`Arvio: …`, `Ilmoittamasi kulutus: …`, and `Oletuskulutus: …` are constructed
from the actual response's assumptions. Profile labels and the source link come
from the response. Before rendering offers, the page checks source, profile ID,
version, amount, and the exact `https://www.sahkonhinta.fi/` URL against the request.
Own-number responses must echo the own amount and source. Unsupported provenance
or a mismatching estimate produces the retry message with offers hidden. Failed
requests retain the input/estimate for retry and re-enable every control.

Offer rendering/order and the Worker are unchanged. Existing whole-URL cache keys
separate equal-kWh own, default, and profile responses, including postcode/fuse.
This PR makes no changes to Core, Contracts, MCP, database, or Cloudflare settings.

## Verification

Run from the repository root, Node 22 or later, no dependencies:

```sh
node --check fi/sahkosopimukset/comparison.js
node tests/fi-housing-profiles.cjs
node tests/fi-postcode.cjs
node tests/fi-main-fuse.cjs
node tests/fi-comparison-links.cjs
node tests/fi-price-periods.cjs
node tests/worker-go-redirects.cjs
```

The 28 housing tests cover defaults, all four profiles, edits/back-edits, focus,
clearing/reselection, other property, positive integer validation, unavailable or
inconsistent responses, visible provenance, and preserved offer order. Existing
fixtures now include the `user_provided` source returned by the live Core; their
previous behavioral assertions remain. Postcode tests additionally exercise cache
isolation for profiles versus equal-kWh own/default requests.

To test an unmodified live Core response through the actual page script:

```sh
curl --fail --silent --show-error 'https://elecz-api.onrender.com/signal/contract?zone=FI&housing_profile=fi_apartment_district_v1' \
  | QUERY='housing_profile=fi_apartment_district_v1' node tests/fi-core-consumption-response.cjs
```

This integration check passed for blank, own 6,789 kWh, and all four profiles;
the 18,000 kWh case also used `postcode=67100&fuse=3x35`. The existing duration
integration check passed with an actual 5,000 kWh Core response and
`EXPECT_DURATION_TEXT='24 kk'`.

**Visual browser QA remains unverified.** The connected local browser was
unavailable. The managed preview server became healthy, but the cloud browser
could not connect; a subsequent tab access was blocked by browser security policy.
No screenshots or successful mobile/desktop browser checks are claimed. The
responsive layout is retained, with the new profile selector constrained to the
form width. Complete visual/mobile/desktop and real-browser interaction checks
before approving production release.

## Release gate

This branch is for review only. Its commit uses `[CF-Pages-Skip]` to prevent an
automatic Cloudflare preview. Do not merge or deploy until separately authorized.
After review, use a normal merge commit, not squash, without the skip marker in
the merge commit message. Verify Cloudflare deploys that exact main SHA before
live checks: blank/default, each profile, manual edit, other property, postcode
67100 versus blank/invalid, and explicit versus default fuse.
