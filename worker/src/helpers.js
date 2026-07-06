import { DOMAIN_REGEX } from "./config.js";

// ----- for fetch and store -----

export function buildAlgoliaEndpoint(searchType, domain, hitsPerPage, sinceTimestamp = null, minPoints = null, page = null) {
  // Return value is something like: 
  // "https://hn.algolia.com/api/v1/search?tags=story&restrictSearchableAttributes=url&query=substack.com&hitsPerPage=300"
  if (sinceTimestamp !== null && minPoints !== null) {
    throw new Error("sinceTimestamp and minPoints cannot both be set at the same time");
  }
  
  const queryParams = new URLSearchParams({
    tags: "story",
    restrictSearchableAttributes: "url",
    query: domain,
    hitsPerPage: String(hitsPerPage),
  });
  if (sinceTimestamp !== null) {
    queryParams.set("numericFilters", `created_at_i>${sinceTimestamp}`);
  }
  if (minPoints !== null) {
    // POINTS NUMERIC FILTER DOESN'T SEEM TO BE WORKING, DESPITE WHAT THE DOCS SAY
    // If they ever fix this, re-enable this
    // queryParams.set("numericFilters", `points>=${minPoints}`);
  }
  if (page !== null) {
    queryParams.set("page", String(page));
  }
  return `https://hn.algolia.com/api/v1/${searchType}?${queryParams}`
}

export async function getApprovedDomains(env) {
  // Fetch approved domains from the db, return only the domain column
  const { results } = await env.DB.prepare(
    "SELECT domain FROM custom_domains WHERE status = 'approved'"
  ).all();
  return results.map((r) => r.domain);
}

export async function fetchCustomDomainHits(searchType, domain, hitsPerPage, sinceTimestamp = null, minPoints = null) {
  // Fetches the result for a single domain and search type (either "search" or "search_by_date").
  // Note: on failure continues on to the next custom domain, does not break the entire process
  try {
    // domains are saved without protocol in the db, add it in the endpoint
    const res = await fetch(buildAlgoliaEndpoint(searchType, `https://${domain}`, hitsPerPage, sinceTimestamp, minPoints));
    if (!res.ok) throw new Error(`status ${res.status}`);
    let data = await res.json();
    // query="..." is fuzzy text match, not an exact filter, so enforce hostname match, 
    // (allowing subdomains of the approved domain? Only for www.
    let filtered = [];
    for (const h of data.hits) {
      if (!h.url) continue;
      const hostname = getHostnameFast(h.url);
      if (hostname && hostname === domain) {
        filtered.push(slimHit(h));
      }
    }
    return filtered
  } catch (err) {
    console.error(`Domain fetch failed for ${domain} (${searchType}):`, err.message);
    return []; // bc this is called from fetchWithConcurrency, which flattens results
  }
}

export async function fetchWithConcurrency(items, worker, limit = 6) {
  // Fires up to 6 requests simultaneously. When one finishes, grabs the next one immediately.
  // Result is an array of arrays (results) which is then flattened in the return statement
  const results = [];
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results.flat();
}

export function slimHit(h) {
  // So JSON stringify takes less time and we don't exceed CFs free CPU time
  return {
    objectID: h.objectID,
    title: h.title,
    url: h.url,
    points: h.points,
    author: h.author,
    created_at: h.created_at,
    created_at_i: h.created_at_i,
    num_comments: h.num_comments,
  };
}

// Again, optimization for staying under CFs free 10ms cpu window 
export function getHostnameFast(url) {
  const match = url.match(/^https?:\/\/([^/?#]+)/i);
  if (!match) return null;
  return match[1].toLowerCase().replace(/^www\./, "");
}

export function isSubstackHostname(url) {
  // Again, Algolia does fuzzy text match, so this is to avoid things like
  // onsubstack.com or notsubstack.com.evil.net
  try {
    const hostname = getHostnameFast(url);
    return hostname === "substack.com" || hostname.endsWith(".substack.com");
  } catch {
    return false;
  }
}

export function payload(data) {
  return JSON.stringify({
    hits: data,
    updatedAt: new Date().toISOString(),
  })
}

// ----- for custom domain submission -----

export function normalizeDomain(input) {
  if (typeof input !== "string") return null;
  let d = input.trim().toLowerCase();
  if (d.length === 0 || d.length > 253) return null;
  if (!/^https?:\/\//.test(d)) d = "https://" + d;
 
  let host;
  try {
    host = new URL(d).hostname;
  } catch {
    return null;
  }
 
  if (host.startsWith("www.")) host = host.slice(4);
  if (!DOMAIN_REGEX.test(host)) return null;
  // reject bare IPs (regex above already requires a dot + letters somewhere,
  // but belt-and-suspenders against IPv4-looking hosts)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
 
  return host;
}
 
export async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "hnsubstacks-domain-validator/1.0" },
      cf: { cacheTtl: 0 },
    });
  } finally {
    clearTimeout(timer);
  }
}

export function jsonResponse(obj, status = 200, CORS_HEADERS = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
