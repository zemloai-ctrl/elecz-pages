# Legal pages — review and release gates (30 October 2026)

Prepared from the revised user-provided legal draft. No merge or production deployment is authorized before Claude's review.

## Included

- Finnish/English privacy, terms and Finnish-comparison methodology at the agreed routes; footer links throughout the site.
- Visible disclosure immediately above FI offer groups and disclosure on the international contract entry page.
- Locally hosted DM Sans/DM Mono fonts with original OFL licenses. No Google Fonts requests remain.
- Decision-audit disclosure added after verifying actual Supabase schema and `contracts/repository.py`: customer_input_snapshot, consumption and created_from_query are persisted. The audit does not have an IP/name/email column, but combinations of technical logs and inputs must not be called anonymous.
- REST retention described as seven days, preserving the current shorter policy.

## Verified

Both sites are Cloudflare Pages projects (`elecz-pages-git` and `cheapesthours`). Core and Contracts databases are Frankfurt. Contracts execution_routes contains one Adtraction route and no other network. New FI click analytics are structured application logs; legacy clicks are in Core Supabase.

## Blocking release checks

- [ ] Apply and verify the separately reviewed Core retention change; raw MCP/error/click rows older than 90 days currently exist.
- [ ] Set and verify retention for Contracts decision audits. No pg_cron extension exists there. Include child candidate and execution records when purging, and preserve non-identifying aggregates if needed. Do not delete offer, ingestion or market history.
- [ ] Verify actual Adtraction transaction report fields in the connected partner account. No claim that reports cannot contain personal data is made.
- [ ] Review the actual account contracts/DPA coverage, particularly consumer Gmail versus Google Workspace; do not label every provider a processor.
- [ ] Cloudflare log-retention endpoint returned Unauthorized despite the connected API permissions. Exact zone log retention is not verified. Provider technical logs remain separate from raw application events.
- [ ] Confirm the Render workspace plan and resulting infrastructure-log retention (documented Hobby 7 days, Pro 14, Scale 30).
- [ ] Confirm eligibility/new-customer labels against live offers before methodology publication. No universal international method is asserted.

## Provider documentation checked

- https://www.cloudflare.com/cloudflare-customer-dpa/ (transfer safeguards)
- https://render.com/dpa (DPF; SCC fallback) and https://render.com/docs/logging (plan-based log retention)
- https://supabase.com/legal/customer-resources/data-processing-addendum and https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq (SCCs; EU region does not mean EU-only processing)
- https://upstash.com/trust/terms and https://upstash.com/trust/dpa.pdf (DPA incorporated into terms; applicable transfer safeguards)
- https://policies.google.com/privacy/frameworks (consumer Google transfer framework; do not substitute Workspace DPA for consumer Gmail)
- https://adtraction.com/partner-agreement/ and https://adtraction.com/exhibit-2-data-transfer-agreement/ (independent controllers and cookie-consent obligations)

Adtraction requires consent for tracking cookies; an affiliate disclosure does not itself provide consent. Inspect/agree a consent-compliant redirect implementation before asserting legal readiness. Current PR does not change tracking destinations or claim that a banner is unnecessary.

Review changes, verify gates, then merge. Do not send the reconsideration email until production checks pass.
