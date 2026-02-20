/**
 * Cloudflare Pages Function: CORS proxy for fal.ai queue API.
 * Forwards requests from /api/fal/* to https://queue.fal.run/*
 * so that CORS preflight errors are avoided in the browser.
 */
export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const upstream =
    "https://queue.fal.run" +
    url.pathname.replace(/^\/api\/fal/, "") +
    url.search;

  const req = new Request(upstream, {
    method: context.request.method,
    headers: context.request.headers,
    body:
      context.request.method !== "GET" && context.request.method !== "HEAD"
        ? context.request.body
        : undefined,
  });

  const response = await fetch(req);

  const headers = new Headers(response.headers);
  headers.set(
    "Access-Control-Allow-Origin",
    context.request.headers.get("Origin") ?? "*",
  );
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Fal-Object-Lifecycle-Preference, X-Fal-Request-Timeout",
  );
  headers.set("Access-Control-Max-Age", "86400");

  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
