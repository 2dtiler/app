/**
 * Cloudflare Pages Function: proxy for HuggingFace Inference API.
 * Forwards requests from /api/hf/* to https://router.huggingface.co/hf-inference/*
 * so that CORS preflight errors are avoided in the browser.
 */
export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  // Strip the /api/hf prefix and forward the rest of the path + query
  const upstream =
    "https://router.huggingface.co" +
    url.pathname.replace(/^\/api\/hf/, "/hf-inference") +
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

  // Re-stream the response, injecting permissive CORS headers so the browser
  // never sees a missing Access-Control-Allow-Origin.
  const headers = new Headers(response.headers);
  headers.set(
    "Access-Control-Allow-Origin",
    context.request.headers.get("Origin") ?? "*",
  );
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Max-Age", "86400");

  // Answer preflight immediately
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
