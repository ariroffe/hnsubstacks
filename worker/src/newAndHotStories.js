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


// --- fetch and store new stories ---

export async function fetchAndStoreNew(env) {
  const prevRaw = await env.HNSUBSTACKS_KV.get("stories:new");
  // If the store was not set, fetch from scratch
  if (!prevRaw) {
    return fetchAndStoreNewFull(env);
  }
  // If it was, only compute new hits from the last time we saved
  const prev = JSON.parse(prevRaw);
  const sinceTimestamp = Math.floor(new Date(prev.updatedAt).getTime() / 1000);
  return fetchAndStoreNewIncremental(env, prev.hits, sinceTimestamp);
}

// Full version: fetch from scratch (for hard refreshes)
export async function fetchAndStoreNewFull(env) {
  // Fetch from Algolia
  const newRes = await fetch(buildAlgoliaEndpoint("search_by_date", "substack.com", BASE_NUM_RESULTS));
  if (!newRes.ok) {
    throw new Error(`Algolia fetch failed: new=${newRes.status}`);
  }
  // Parse, check exact hostname match, remove unnecesary fields
  const newBaseHits = await newRes.json().then(n => {
    const out = [];
    for (const h of n.hits) {
      if (h.url && isSubstackHostname(h.url)) out.push(slimHit(h));
    }
    return out;
  });

  const domains = await getApprovedDomains(env);
  const newDomainHits = await fetchWithConcurrency(domains, (domain) =>
    // Unlikely that there are more than 10 new items from the same custom domain
    fetchCustomDomainHits("search_by_date", domain, 10)
  );

  const newFullHits = [...newBaseHits, ...newDomainHits]
    .sort((a, b) => b.created_at_i - a.created_at_i)
    .slice(0, BASE_NUM_RESULTS);

  await env.HNSUBSTACKS_KV.put("stories:new", payload(newFullHits), {
    expirationTtl: 3600,
  });

  return newFullHits;
}

// Incremental version: fetch new stories since the last timestamp
async function fetchAndStoreNewIncremental(env, prevHits, sinceTimestamp) {
  // Fetch from Algolia, only items newer than the last stored update
  const newEndpoint = `${buildAlgoliaEndpoint("search_by_date", "substack.com", BASE_NUM_RESULTS, sinceTimestamp)}`;
  const newRes = await fetch(newEndpoint);
  if (!newRes.ok) {
    throw new Error(`Algolia fetch failed: new=${newRes.status}`);
  }
  // Parse, check exact hostname match, remove unnecesary fields
  const newBaseHits = await newRes.json().then(n => {
    const out = [];
    for (const h of n.hits) {
      if (h.url && isSubstackHostname(h.url)) out.push(slimHit(h));
    }
    return out;
  });

  const domains = await getApprovedDomains(env);
  const newDomainHits = await fetchWithConcurrency(domains, (domain) =>
    // Unlikely that there are more than 10 new items from the same custom domain
    fetchCustomDomainHits("search_by_date", domain, 10, sinceTimestamp)
  );
  
  // Merge fresh hits (domain + base) with previous hits, keeping the freshest
  // version of each story and dropping stale duplicates
  const combined = [...newDomainHits, ...newBaseHits, ...prevHits];
  const seen = new Set();
  const newFullHits = combined
    .filter(h => {
      if (seen.has(h.objectID)) return false;
      seen.add(h.objectID);
      return true;
    })
    .sort((a, b) => b.created_at_i - a.created_at_i)
    .slice(0, BASE_NUM_RESULTS);

  await env.HNSUBSTACKS_KV.put("stories:new", payload(newFullHits), {
    expirationTtl: 3600,
  });
  return newFullHits;
}

// --- hot stories ---

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

export async function computeAndStoreHot(env, newFullHits = null) {
  // Reuse hits if passed in (e.g. from fetchAndStoreAll), otherwise read from KV
  let hits = newFullHits;
  if (!hits) {
    const stored = await env.HNSUBSTACKS_KV.get("stories:new");
    if (!stored) return; // nothing to compute from yet
    hits = JSON.parse(stored).hits;
  }

  const hotFullHits = computeHot(hits);

  await env.HNSUBSTACKS_KV.put("stories:hot", payload(hotFullHits), {
    expirationTtl: 3600,
  });
}