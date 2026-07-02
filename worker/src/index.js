const DEBUG = true
const ALGOLIA_BASE = "https://hn.algolia.com/api/v1";
const QUERY_PARAMS = "tags=story&restrictSearchableAttributes=url&query=substack.com&hitsPerPage=600";

function hnScore(points, createdAtUnix, now) {
  const ageHours = (now - createdAtUnix) / 3600;
  const gravity = 1.8;
  return (points - 1) / Math.pow(ageHours + 2, gravity);
}

function computeHot(hits) {
  const now = Date.now() / 1000;
  return [...hits]
    .map(hit => ({
      ...hit,
      _hnScore: hnScore(hit.points, hit.created_at_i, now),
    }))
    .sort((a, b) => b._hnScore - a._hnScore);
}

async function fetchAndStore(env) {
  // Fetch both new and best (historical ordered by points)
  const [newRes, bestRes] = await Promise.all([
    fetch(`${ALGOLIA_BASE}/search_by_date?${QUERY_PARAMS}`),
	fetch(`${ALGOLIA_BASE}/search?${QUERY_PARAMS}`),
  ]);

  if (!newRes.ok || !bestRes.ok) {
    throw new Error(
      `Algolia fetch failed: new=${newRes.status} best=${bestRes.status}`
    );
  }

  const [newData, bestData] = await Promise.all([
    newRes.json(),
	bestRes.json(),
  ]);

  // Compute hot (HNs trending algorithm) from new
  const hotData = {hits: computeHot(newData.hits)};
  
  const payload = (data) =>
    JSON.stringify({
      hits: data.hits,
      updatedAt: new Date().toISOString(),
    });

  await Promise.all([
	env.HNSUBSTACKS_KV.put("stories:hot", payload(hotData), {
      expirationTtl: 3600,  // safety-net TTL; cron refreshes well before this
    }),
	env.HNSUBSTACKS_KV.put("stories:new", payload(newData), {
      expirationTtl: 3600,
    }),
	env.HNSUBSTACKS_KV.put("stories:best", payload(bestData), {
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
	  const sortParam = url.searchParams.get("sort");
	  let sort = "hot";
      if (sort === "new") sort = "new";
	  if (sort === "best") sort = "best";
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