import { BEST_STORIES_SAVED, BEST_STORIES_PER_CUSTOM_DOMAIN, BEST_NUM_PAGES } from "./config.js";
import {
  buildAlgoliaEndpoint,
  getApprovedDomains,
  fetchWithConcurrency,
  fetchCustomDomainHits,
  slimHit,
  isSubstackHostname,
  payload
} from "./helpers.js";

// --- fetch and store best stories ---

export async function fetchAndStoreBest(env) {
  const prevRaw = await env.HNSUBSTACKS_KV.get("stories:best");
  // If the store was not set, fetch from scratch
  if (!prevRaw) {
    return fetchAndStoreBestFull(env);
  }
  // If it was, only compute new hits from the last time we saved
  const prev = JSON.parse(prevRaw);
  return fetchAndStoreBestPaginated(env, prev.hits);
}

// -------------------------------------------

// Full version: fetch from scratch (for hard refreshes)
export async function fetchAndStoreBestFull(env) {
  // DESPITE WHAT THE DOCS SAY, points DOESN'T SEEM TO BE AVAILABLE AS A NUMERIC FILTER
  // Get the minimum score from previous iterations to qualify into best
  // const minPoints = await env.HNSUBSTACKS_KV.get("stories:best:minPoints", "json");

  // Fetch from Algolia
  const bestRes = await fetch(buildAlgoliaEndpoint("search", "substack.com", BEST_STORIES_SAVED));  //, null, minPoints));
  if (!bestRes.ok) {
    throw new Error(`Algolia fetch failed: best=${bestRes.status}`);
  }
  // Parse, check exact hostname match, remove unnecesary fields
  const bestBaseHits = await bestRes.json().then(n => {
    const out = [];
    for (const h of n.hits) {
      if (h.url && isSubstackHostname(h.url)) out.push(slimHit(h));
    }
    return out;
  });

  const domains = await getApprovedDomains(env);
  const bestDomainHits = await fetchWithConcurrency(domains, (domain) =>
    fetchCustomDomainHits("search", domain, BEST_STORIES_PER_CUSTOM_DOMAIN)  // , null, minPoints)
  );

  const bestFullHits = [...bestBaseHits, ...bestDomainHits]
    .sort((a, b) => b.points - a.points)
    .slice(0, BEST_STORIES_SAVED);

  await env.HNSUBSTACKS_KV.put("stories:best", payload(bestFullHits), {
    expirationTtl: 3600 * 13, // 13h safety margin beyond the 6h refresh cycle,
  });

  // Update the min points for the next round
  // const newMinPoints = bestFullHits[bestFullHits.length - 1].points
  // if (minPoints < newMinPoints && bestFullHits.length === BEST_STORIES_SAVED) {
    // await env.HNSUBSTACKS_KV.put(
      // "stories:best:minPoints",
      // JSON.stringify(newMinPoints), 
      // { expirationTtl: 3600 * 13 }
    // );
  // }

  return bestFullHits;
}

// ------------------------------------------- 

// Incremental version: Fetches paginated results. Paginates both base and custom domain results
// by the same page index

// Numbers should be divisible, but the Math.floor is just defensive in case they are not
const BASE_PAGE_SIZE = Math.floor(BEST_STORIES_SAVED / BEST_NUM_PAGES);
const DOMAIN_PAGE_SIZE = Math.floor(BEST_STORIES_PER_CUSTOM_DOMAIN / BEST_NUM_PAGES);

async function fetchAndStoreBestPaginated(env, prevHits) {
  const pageIndex = (Number(await env.HNSUBSTACKS_KV.get("stories:best:pageIndex")) || 0) % BEST_NUM_PAGES;

  // Fetch one page of base substack.com results
  const bestRes = await fetch(
    buildAlgoliaEndpoint("search", "substack.com", BASE_PAGE_SIZE, null, null, pageIndex)
  );
  if (!bestRes.ok) {
    throw new Error(`Algolia fetch failed: best page=${pageIndex} status=${bestRes.status}`);
  }
  const pageBaseHits = await bestRes.json().then(n => {
    const out = [];
    for (const h of n.hits) {
      if (h.url && isSubstackHostname(h.url)) out.push(slimHit(h));
    }
    return out;
  });

  // Fetch matching page of custom domain results
  const domains = await getApprovedDomains(env);
  const pageDomainHits = await fetchWithConcurrency(domains, (domain) =>
    fetchCustomDomainHits("search", domain, DOMAIN_PAGE_SIZE, null, pageIndex)
  );

  // Merge new hits into the existing best, dedupe by objectID
  const merged = new Map(prevHits.map(h => [h.objectID, h]));
  for (const h of [...pageBaseHits, ...pageDomainHits]) merged.set(h.objectID, h);
  const bestFullHits = [...merged.values()]
    .sort((a, b) => b.points - a.points)
    .slice(0, BEST_STORIES_SAVED);

  await env.HNSUBSTACKS_KV.put("stories:best", payload(bestFullHits), {
    expirationTtl: 3600 * 13,
  });

  await env.HNSUBSTACKS_KV.put("stories:best:pageIndex", String((pageIndex + 1) % BEST_NUM_PAGES));

  return bestFullHits;
}
