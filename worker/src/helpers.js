// ----- for fetch and store -----

export function buildAlgoliaEndpoint(searchType, domain, hitsPerPage, sinceTimestamp = null) {
  // Return value is something like: 
  // "https://hn.algolia.com/api/v1/search?tags=story&restrictSearchableAttributes=url&query=substack.com&hitsPerPage=300"
  const queryParams = new URLSearchParams({
    tags: "story",
    restrictSearchableAttributes: "url",
    query: domain,
    hitsPerPage: String(hitsPerPage),
  });
  if (sinceTimestamp !== null) {
    queryParams.set("numericFilters", `created_at_i>${sinceTimestamp}`);
  }
  return `https://hn.algolia.com/api/v1/${searchType}?${queryParams}`
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