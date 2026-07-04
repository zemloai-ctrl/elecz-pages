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

    if (
      path.startsWith("/mcp") ||
      path.startsWith("/go/") ||
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

    // Everything else (actual site pages, assets) goes through normal
    // Pages asset serving, including legitimate SPA fallback if needed.
    return env.ASSETS.fetch(request);
  },
};
