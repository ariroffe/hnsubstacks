import { BASE_NUM_RESULTS } from "./config.js";
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
  // Fetch from Algolia
  const bestRes = await fetch(buildAlgoliaEndpoint("search", "substack.com", BASE_NUM_RESULTS));
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
    // Up to 30 results from the same custom domain
    fetchCustomDomainHits("search", domain, 30)
  );

  const bestFullHits = [...bestBaseHits, ...bestDomainHits]
    .sort((a, b) => b.points - a.points)
    .slice(0, BASE_NUM_RESULTS);

  await env.HNSUBSTACKS_KV.put("stories:best", payload(bestFullHits), {
    expirationTtl: 3600 * 13, // 13h safety margin beyond the 6h refresh cycle,
  });

  return bestFullHits;
}
