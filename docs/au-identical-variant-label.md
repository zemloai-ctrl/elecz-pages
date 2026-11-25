# AU identical-price variant label

Core supplies optional variant_count. The NSW offer card adds `+N identical-price plan variants`, where N is the returned count minus the displayed representative. It uses textContent through the existing node helper. Count1/missing/noninteger/boolean/invalid metadata adds no label. Price, recommendation badge, ordering, GST statement and common-set notice are unchanged. The browser does not group, price or re-check eligibility and does not infer acquisition-channel types.

Requires the separate Contracts grouping and Core metadata PRs before labels appear with live responses. Until then the existing response renders unchanged. No navigation/indexing/availability/worker/FI/IT edits; public pages stay in their current state. This is a Draft PR; main merge would publish through the existing GitHub integration and is not authorized here.

Offline tests cover count11, legacy/invalid values, unchanged price and common scope. The existing fixture-only browser matrix checks the label at320/375/1440 widths. No real Core response is fetched during tests, and no synthetic price is embedded in the site.
