export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Proxy these paths to Render backend
    const RENDER = "https://elecz-api.onrender.com";

    if (
      path.startsWith("/signal") ||
      path.startsWith("/mcp") ||
      path.startsWith("/go/") ||
      path === "/health" ||
      path.startsWith("/.well-known/")
    ) {
      const target = RENDER + path + url.search;
      const proxyRequest = new Request(target, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      return fetch(proxyRequest);
    }

    // Proxy openapi.json from elecz-api GitHub
    if (path === "/openapi.json") {
      return fetch(
        "https://raw.githubusercontent.com/zemloai-ctrl/elecz-api/main/openapi.json"
      );
    }

    // Everything else: serve static files from Pages
    return env.ASSETS.fetch(request);
  },
};
