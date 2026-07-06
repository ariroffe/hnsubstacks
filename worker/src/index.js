import { fetchAndStoreNew, fetchAndStoreNewFull, computeAndStoreHot } from "./newAndHotStories.js";
import { fetchAndStoreBest } from "./bestStories.js";
import { handleDomainRequest, handleFlagDomain } from "./postHandlers.js";

// --- hard refresh of all stories ---

async function fetchAndStoreAll(env) {
  const [newFullHits] = await Promise.all([
    fetchAndStoreNewFull(env),
    fetchAndStoreBest(env),
  ]);
  await computeAndStoreHot(env, newFullHits);
}


// ---------- fetch handler ----------

export default {
  async fetch(request, env, ctx) {
    const DEBUG = env.DEBUG === "true";
    const CORS_HEADERS = DEBUG ? {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    } : {}
    
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method === "GET" && url.pathname === "/api/stories") {
      const sortParam = url.searchParams.get("sort");
      let sort = "hot";
      if (sortParam === "new") sort = "new";
      if (sortParam === "best") sort = "best";
      const data = await env.HNSUBSTACKS_KV.get(`stories:${sort}`);

      if (!data) {
        // Cold-start fallback: only hit if KV is truly empty (first deploy,
        // or safety-net TTL expired because cron somehow didn't run).
        await fetchAndStoreAll(env);
        const fresh = await env.HNSUBSTACKS_KV.get(`stories:${sort}`);
        return new Response(fresh, {
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }

      return new Response(data, {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/domains/request") {
      return handleDomainRequest(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/domains/flag") {
      return handleFlagDomain(request, env);
    }

    // Manual trigger for testing
    if (DEBUG && url.pathname === "/api/refresh") {
      await fetchAndStoreAll(env);
      return new Response("refreshed", { headers: CORS_HEADERS });
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },

  async scheduled(event, env, ctx) {
    // I'm separating the refresh of the new / best / hot stores into 3 cron 
    // triggers bc otherwise we sometimes hit CFs free 10ms of cpu time
    if (event.cron === "*/10 * * * *") {
      ctx.waitUntil(fetchAndStoreNew(env));
    } else if (event.cron === "2-59/10 * * * *") {
      ctx.waitUntil(computeAndStoreHot(env));
    } else if (event.cron === "0 */6 * * *") {
      ctx.waitUntil(fetchAndStoreBest(env));
    }
  },
};