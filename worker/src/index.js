const DEBUG = true
const ALGOLIA_BASE = "https://hn.algolia.com/api/v1";
const QUERY_PARAMS = "tags=story&restrictSearchableAttributes=url&query=substack.com&hitsPerPage=600";

async function fetchAndStore(env) {
  const [topRes, newRes] = await Promise.all([
    fetch(`${ALGOLIA_BASE}/search?${QUERY_PARAMS}`),
    fetch(`${ALGOLIA_BASE}/search_by_date?${QUERY_PARAMS}`),
  ]);

  if (!topRes.ok || !newRes.ok) {
    throw new Error(
      `Algolia fetch failed: top=${topRes.status} new=${newRes.status}`
    );
  }

  const [topData, newData] = await Promise.all([
    topRes.json(),
    newRes.json(),
  ]);

  const payload = (data) =>
    JSON.stringify({
      hits: data.hits,
      updatedAt: new Date().toISOString(),
    });

  await Promise.all([
    env.HNSUBSTACKS_KV.put("stories:top", payload(topData), {
      expirationTtl: 3600, // safety-net TTL; cron refreshes well before this
    }),
    env.HNSUBSTACKS_KV.put("stories:new", payload(newData), {
      expirationTtl: 3600,
    }),
  ]);
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": DEBUG ? "*" : "https://hnsubstacks.com",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/stories") {
      const sort = url.searchParams.get("sort") === "new" ? "new" : "top";
      const data = await env.HNSUBSTACKS_KV.get(`stories:${sort}`);

      if (!data) {
        // Cold-start fallback: only hit if KV is truly empty (first deploy,
        // or safety-net TTL expired because cron somehow didn't run).
        await fetchAndStore(env);
        const fresh = await env.HNSUBSTACKS_KV.get(`stories:${sort}`);
        return new Response(fresh, {
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }

      return new Response(data, {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    // Manual trigger for testing
    if (DEBUG && url.pathname === "/api/refresh") {
      await fetchAndStore(env);
      return new Response("refreshed", { headers: CORS_HEADERS });
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetchAndStore(env));
  },
};