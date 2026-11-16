const IT_OFFER_CONSUMPTIONS = [1500, 2700, 4000];
const IT_NUMBER = new Intl.NumberFormat("it-IT", { useGrouping: "always" });
const IT_EUROS = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const IT_MONTH = new Intl.DateTimeFormat("it-IT", {
  month: "long", year: "numeric", timeZone: "Europe/Rome",
});
const IT_DAY = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "long", timeZone: "Europe/Rome",
});
const IT_LINK_LABELS = {
  offer_page: "Pagina dell’offerta",
  supplier_offers_page: "Offerte del venditore",
  supplier_homepage: "Sito del venditore",
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function italianOfferLink(link) {
  if (!link || !Object.hasOwn(IT_LINK_LABELS, link.kind) ||
      typeof link.url !== "string" || !link.url.startsWith("https://")) return null;
  try {
    const url = new URL(link.url);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return { url: url.href, label: IT_LINK_LABELS[link.kind] };
  } catch {
    return null;
  }
}

function italianOffer(offer, type) {
  if (offer?.contract_type !== type ||
      typeof offer.name !== "string" || !offer.name.trim() ||
      typeof offer.provider !== "string" || !offer.provider.trim()) return null;
  const cost = offer.annual_supply_cost_eur;
  const indexed = type === "pun_indexed";
  const prices = indexed ? [cost?.min, cost?.max] : [cost];
  if (!prices.every(price => Number.isFinite(price) && price >= 0) ||
      (indexed && prices[0] > prices[1])) return null;
  const yearly = prices.map(price => IT_EUROS.format(price)).join(" – ");
  const monthly = prices.map(price => IT_EUROS.format(Math.round(price / 12))).join(" – ");
  const label = indexed ? "Prezzo variabile (indicizzato al PUN)" : "Prezzo fisso";
  const link = italianOfferLink(offer.link);
  return {
    name: offer.name,
    description: `${offer.provider} · ${label} · ${yearly} / anno · spesa annua stimata (solo vendita)${indexed ? " · scenari storici PUN" : ""} · Circa ${monthly} / mese (media annua)`,
    link,
  };
}

function italianCoverage(coverage) {
  if (coverage?.scope !== "household_offers_in_snapshot" ||
      !Number.isInteger(coverage.compared_offers) || coverage.compared_offers < 0 ||
      !Number.isInteger(coverage.household_offers) ||
      coverage.household_offers < coverage.compared_offers) return "";
  return `Copertura: ${IT_NUMBER.format(coverage.compared_offers)} di ${IT_NUMBER.format(coverage.household_offers)} offerte domestiche nel dataset.`;
}

async function renderItalianOffers(origin, render, ctx) {
  const now = new Date();
  const day = IT_DAY.format(now);
  const cache = caches.default;
  const key = new URL("/__elecz-cache/it-offers-v1", origin);
  key.searchParams.set("day", day);
  const cached = await cache.match(key.href);
  if (cached) return cached.text();

  const signal = AbortSignal.timeout(4000);
  const profiles = await Promise.all(IT_OFFER_CONSUMPTIONS.map(async consumption => {
    const url = new URL("/signal/contract", render);
    url.search = new URLSearchParams({ zone: "IT", consumption });
    const response = await fetch(url, { signal, redirect: "error" });
    if (!response.ok) throw new Error("Italian contract API unavailable");
    const data = await response.json();
    if (data?.contract_comparison !== "available" || data.market !== "IT" ||
        data.cost_scope !== "electricity_sales_only") throw new Error("Italian comparison unavailable");
    return {
      consumption,
      coverage: italianCoverage(data.coverage),
      offers: [italianOffer(data.best_fixed, "fixed"), italianOffer(data.best_indexed, "pun_indexed")]
        .filter(Boolean),
    };
  }));
  if (profiles.some(profile => !profile.offers.length)) return "";

  const heading = `Le migliori offerte luce di ${IT_MONTH.format(now)}`;
  const items = [];
  const cards = profiles.map(({ consumption, coverage, offers }) => {
    const profile = `${IT_NUMBER.format(consumption)} kWh/anno`;
    const entries = offers.map(({ name, description, link }) => {
      items.push({
        "@type": "ListItem",
        position: items.length + 1,
        name,
        description: `${profile} · ${description}`,
        ...(link ? { url: link.url } : {}),
      });
      return `<li><strong>${escapeHtml(name)}</strong><br>${escapeHtml(description)}${link
        ? `<br><a href="${escapeHtml(link.url)}" rel="nofollow">${escapeHtml(link.label)}</a>`
        : ""}</li>`;
    }).join("");
    return `<section class="tool-card"><h3>${profile}</h3><ul>${entries}</ul>${coverage
      ? `<p><small>${escapeHtml(coverage)}</small></p>`
      : ""}</section>`;
  }).join("");
  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: heading,
    itemListElement: items,
  }).replace(/</g, "\\u003c");
  const html = `<section class="section" aria-labelledby="offerte-luce-mese">
    <h2 id="offerte-luce-mese">${escapeHtml(heading)}</h2>
    <p>Aggiornato il ${escapeHtml(day)} · Tra le offerte confrontate</p>
    <div class="tools-grid">${cards}</div>
    <p>Stime della sola vendita di energia. La disponibilità locale e le condizioni legate alla residenza vanno verificate con il venditore. Fonte dei dati: <a href="https://www.ilportaleofferte.it/">Portale Offerte</a>.</p>
    <p><a href="/it/confronto/">Confronta le offerte con il tuo consumo</a></p>
    <script type="application/ld+json">${json}</script>
  </section>`;
  ctx.waitUntil(cache.put(key.href, new Response(html, {
    headers: { "Cache-Control": "public, max-age=3600" },
  })).catch(() => {}));
  return html;
}

async function italianHome(request, env, ctx, render) {
  const url = new URL(request.url);
  url.pathname = "/it/";
  const headers = new Headers(request.headers);
  headers.delete("If-None-Match");
  headers.delete("If-Modified-Since");
  const response = await env.ASSETS.fetch(new Request(url, { headers }));
  if (!response.ok || !response.headers.get("Content-Type")?.includes("text/html")) return response;

  let html;
  try {
    html = await renderItalianOffers(url.origin, render, ctx);
  } catch {
    return response;
  }
  if (!html) return response;
  const transformed = new HTMLRewriter().on("#italian-offers-slot", {
    element(element) { element.replace(html, { html: true }); },
  }).transform(response);
  transformed.headers.delete("ETag");
  transformed.headers.delete("Last-Modified");
  transformed.headers.delete("Content-Length");
  transformed.headers.set("Cache-Control", "no-store");
  return transformed;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const RENDER = "https://elecz-api.onrender.com";
    const CACHE_TTL = 300;
    // GET/HEAD requests must never carry a body when constructing a new
    // Request — some clients (bots/scanners) send an empty-but-present body
    // stream alongside GET, which otherwise throws:
    // "TypeError: Request with a GET/HEAD method cannot have a body."
    const hasNoBody = request.method === "GET" || request.method === "HEAD";
    // Public rolling 24h request counter. Cloudflare credentials stay server-side.
    if (path === "/usage") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
      }

      const cache = caches.default;
      const cacheKey = new Request(url.origin + "/usage", { method: "GET" });
      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) {
        return Response.json({ error: "Usage analytics unavailable" }, { status: 503 });
      }

      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      const query = `query($zoneTag: string, $start: Time, $end: Time) {
        viewer {
          zones(filter: { zoneTag: $zoneTag }) {
            httpRequestsAdaptiveGroups(
              limit: 1
              filter: { datetime_geq: $start, datetime_lt: $end }
            ) {
              count
            }
          }
        }
      }`;

      try {
        const cf = await fetch("https://api.cloudflare.com/client/v4/graphql", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.CF_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query,
            variables: {
              zoneTag: env.CF_ZONE_ID,
              start: start.toISOString(),
              end: end.toISOString(),
            },
          }),
        });
        const payload = await cf.json();
        if (!cf.ok || payload.errors) throw new Error("Cloudflare analytics query failed");

        const groups = payload?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
        const requests = groups.reduce((total, group) => total + Number(group?.count || 0), 0);
        const body = JSON.stringify({
          requests_served_24h: requests,
          window: "rolling_24h",
          updated_at: end.toISOString(),
          source: "Cloudflare Analytics",
        });
        const response = new Response(body, {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return request.method === "HEAD" ? new Response(null, response) : response;
      } catch {
        return Response.json({ error: "Usage analytics unavailable" }, { status: 502 });
      }
    }

    const cacheable =
      path.startsWith("/signal") ||
      path.startsWith("/spot");
    if (cacheable) {
      const cache = caches.default;
      const cacheKey = new Request(url.toString(), { method: "GET" });
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      const target = RENDER + path + url.search;
      const response = await fetch(new Request(target, {
        method: request.method,
        headers: request.headers,
        body: hasNoBody ? undefined : request.body,
      }));
      if (response.ok) {
        const toCache = new Response(response.clone().body, response);
        toCache.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
        ctx.waitUntil(cache.put(cacheKey, toCache));
      }
      return response;
    }
    // Redirects must reach the browser; never follow supplier/affiliate links here.
    if (path.startsWith("/go/")) {
      const target = RENDER + path + url.search;
      const upstream = await fetch(new Request(target, {
        method: request.method,
        headers: request.headers,
        body: hasNoBody ? undefined : request.body,
        redirect: "manual",
        cache: "no-store",
      }));
      const response = new Response(upstream.body, upstream);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("CDN-Cache-Control", "no-store");
      return response;
    }
    if (
      path.startsWith("/mcp") ||
      path === "/health" ||
      path.startsWith("/.well-known/")
    ) {
      const target = RENDER + path + url.search;
      return fetch(new Request(target, {
        method: request.method,
        headers: request.headers,
        body: hasNoBody ? undefined : request.body,
      }));
    }
    if (path === "/openapi.json") {
      return fetch(
        "https://raw.githubusercontent.com/zemloai-ctrl/elecz-api/main/openapi.json"
      );
    }
    // ─── API-shaped paths that don't match any known route get a hard 404 ──
    // env.ASSETS.fetch() falls back to index.html (200) for anything that
    // doesn't match a static file — standard Cloudflare Pages SPA behavior.
    // That silently turned every guessed /api/*, /v1/*, etc. path into a
    // "successful" 200 response carrying the full homepage HTML, which gave
    // scanning bots/agents no negative signal to stop hitting those paths.
    // Anything that looks like an API call but isn't one of our real routes
    // should fail loudly instead of resolving to the homepage.
    const looksLikeApiPath =
      path.startsWith("/api/") ||
      path.startsWith("/v1/") ||
      path.startsWith("/v2/") ||
      path.startsWith("/rest/");
    if (looksLikeApiPath) {
      return new Response(
        JSON.stringify({ error: "Not found", path }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        }
      );
    }
    // ─── Language paths are lowercase; send /FI, /Fi/... to the real URL ───
    // Without this, an uppercase path misses every asset and falls back to
    // the English homepage with a 200 instead of the language page.
    if (/^\/(fi|sv|de|fr|es|it|ja)(\/.*)?$/i.test(path) && path !== path.toLowerCase()) {
      const target = new URL(url);
      target.pathname = path.toLowerCase();
      if (target.pathname.length === 3) target.pathname += "/";
      return Response.redirect(target.toString(), 301);
    }
    // ─── Avoid 301 trailing-slash redirects for these known content pages ──
    // Cloudflare Pages' default asset handling issues a 301 from
    // "/docs" -> "/docs/" (etc.) whenever the matching static file is
    // "docs/index.html". External backlinks (MCP directories, GitHub READMEs)
    // point at the no-slash form, so every crawl of these pages was hitting
    // a redirect hop, which Google Search Console reported as
    // "Page with redirect" (not indexed). Instead of redirecting, fetch the
    // slash-form asset directly and serve it at the requested (no-slash)
    // path with a 200 — no redirect, no duplicate-URL indexing issue, as
    // long as the page itself sets a canonical tag pointing at the
    // slash-form URL.
    const NO_SLASH_REDIRECT = [
      "/docs",
      "/privacy",
      "/terms",
      "/support",
      "/electricity-price-api",
      "/electricity-price-mcp",
      "/chatgpt",
      "/compare-electricity-contracts",
      "/cheapest-hours",
      "/best-time-to-charge-ev",
      "/for-agents",
      "/fi",
      "/ja",
      "/de",
      "/fr",
      "/es",
      "/it",
      "/sv",
    ];
    if (request.method === "GET" && (path === "/it/" || path === "/it")) {
      return italianHome(request, env, ctx, RENDER);
    }
    if (NO_SLASH_REDIRECT.includes(path)) {
      const assetUrl = new URL(url);
      assetUrl.pathname = path + "/";
      const assetRequest = new Request(assetUrl.toString(), request);
      return env.ASSETS.fetch(assetRequest);
    }
    // Everything else (actual site pages, assets) goes through normal
    // Pages asset serving, including legitimate SPA fallback if needed.
    return env.ASSETS.fetch(request);
  },
};
