export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const RENDER = "https://elecz-api.onrender.com";

    const CACHE_TTL = 300;
    const cacheable =
      path.startsWith("/signal") ||
      path.startsWith("/spot") ||
      path.startsWith("/cheapest");

    if (cacheable) {
      const cache = caches.default;
      const cacheKey = new Request(url.toString(), { method: "GET" });

      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      const target = RENDER + path + url.search;
      const response = await fetch(new Request(target, {
        method: request.method,
        headers: request.headers,
        body: request.body,
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
        body: request.body,
      }));
    }

    if (path === "/openapi.json") {
      return fetch(
        "https://raw.githubusercontent.com/zemloai-ctrl/elecz-api/main/openapi.json"
      );
    }

    return env.ASSETS.fetch(request);
  },
};
