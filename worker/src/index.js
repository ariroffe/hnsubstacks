// ---------- settings ----------

const ALGOLIA_BASE = "https://hn.algolia.com/api/v1";

// Domains we never accept as "custom domain" submissions because they're
// either the app's own domain, the platform's own domain, or not real hosts.
const DOMAIN_DENYLIST = new Set(["substack.com", "www.substack.com", "hnsubstacks.com"]);
const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

// For throttling post requests to add custom domains
const IP_HOURLY_LIMIT = 5;

// This should be an env var, but I'm too lazy to change it
const DEBUG = false  // Flip it to true to use Vite's dev server in frontend/
const CORS_HEADERS = DEBUG ? {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} : {};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ---------- fetch stories ----------

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

// --- fetch helpers ---

async function getApprovedDomains(env) {
  // Fetch approved domains from the db, return only the domain column
  const { results } = await env.DB.prepare(
    "SELECT domain FROM custom_domains WHERE status = 'approved'"
  ).all();
  return results.map((r) => r.domain);
}

function buildAlgoliaEndpoint(searchType, domain, hitsPerPage) {
  // Return value is something like: 
  // "https://hn.algolia.com/api/v1/search?tags=story&restrictSearchableAttributes=url&query=substack.com&hitsPerPage=600"
  const queryParams = new URLSearchParams({
    tags: "story",
    restrictSearchableAttributes: "url",
    query: domain,
    hitsPerPage: String(hitsPerPage),
  });
  return `${ALGOLIA_BASE}/${searchType}?${queryParams}`
}

async function fetchDomainHits(searchType, domain, hitsPerPage) {
  // Fetches the result for a single domain and search type (either "search" or "search_by_date").
  // Note: on failure continues on to the next custom domain, does not break the entire process
  try {
    // domains are saved without protocol in the db, add it in the endpoint
    const res = await fetch(buildAlgoliaEndpoint(searchType, `https://${domain}`, hitsPerPage));
    if (!res.ok) throw new Error(`status ${res.status}`);
    let data = await res.json();
    // query="..." is fuzzy text match, not an exact filter, so enforce hostname match, 
    // (allowing subdomains of the approved domain? Only for www.
    const filtered = data.hits.filter((h) => {
      try {
        const hostname = new URL(h.url).hostname.toLowerCase();
        const d = domain.toLowerCase();
        return hostname === d || hostname === `www.${d}`;
      } catch {
        return false;
      }
    })
    return filtered
  } catch (err) {
    console.error(`Domain fetch failed for ${domain} (${searchType}):`, err.message);
    return []; // bc this is called from fetchWithConcurrency, which flattens results
  }
}

async function fetchWithConcurrency(items, worker, limit = 6) {
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

function isSubstackHostname(url) {
  // Again, Algolia does fuzzy text match, so this is to avoid things like
  // onsubstack.com or notsubstack.com.evil.net
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "substack.com" || hostname.endsWith(".substack.com");
  } catch {
    return false;
  }
}

// --- main fetch and store ---

async function fetchAndStore(env) {
  // Fetch both new and best (historical ordered by points) for the domain "substack.com"
  const [newRes, bestRes] = await Promise.all([
    fetch(buildAlgoliaEndpoint("search_by_date", "substack.com", 600)),
	  fetch(buildAlgoliaEndpoint("search", "substack.com", 600)),
  ]);
  // If this main query fails, break the entire flow
  if (!newRes.ok || !bestRes.ok) {
    throw new Error(
      `Algolia fetch failed: new=${newRes.status} best=${bestRes.status}`
    );
  }
  const [newBaseHits, bestBaseHits] = await Promise.all([
    newRes.json().then(n => n.hits.filter(h => h.url && isSubstackHostname(h.url))),
	  bestRes.json().then(b => b.hits.filter(h => h.url && isSubstackHostname(h.url))),
  ]);

  // Get stories from cuestom domains
  const domains = await getApprovedDomains(env);
  const [newDomainHits, bestDomainHits] = await Promise.all([
    // The same substack will likey have fewer hits in new than in best, so cap lower
    fetchWithConcurrency(domains, (domain) => fetchDomainHits("search_by_date", domain, 15)),
    fetchWithConcurrency(domains, (domain) => fetchDomainHits("search", domain, 30)),
  ]);

  // Join the results, reorder and slice
  const newFullHits = [...newBaseHits, ...newDomainHits]
    .sort((a, b) => b.created_at_i - a.created_at_i)
    .slice(0, 600);
  const bestFullHits = [...bestBaseHits, ...bestDomainHits]
    .sort((a, b) => b.points - a.points)
    .slice(0, 600);

  // Compute hot (simulating HNs trending algorithm) from new
  const hotFullHits = computeHot(newFullHits);
  
  const payload = (data) =>
    JSON.stringify({
      hits: data,
      updatedAt: new Date().toISOString(),
    });

  await Promise.all([
	env.HNSUBSTACKS_KV.put("stories:hot", payload(hotFullHits), {
      expirationTtl: 3600,  // safety-net TTL; cron refreshes well before this
    }),
	env.HNSUBSTACKS_KV.put("stories:new", payload(newFullHits), {
      expirationTtl: 3600,
    }),
	env.HNSUBSTACKS_KV.put("stories:best", payload(bestFullHits), {
      expirationTtl: 3600,
    }),
  ]);
}

// ---------- custom domain submission ----------

function normalizeDomain(input) {
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
 
async function fetchWithTimeout(url, ms) {
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
 
// Best-effort automatic check that a domain is actually a Substack.
// Two independent signals:
// - the RSS feed's <generator> tag
// - Substack CDN asset references on the homepage. 
// Either one is treated as sufficient; if both checks
// fail or error out, the domain falls back to manual review.
async function validateSubstackDomain(domain) {
  const notes = [];
  let isSubstack = false;
 
  try {
    const feedRes = await fetchWithTimeout(`https://${domain}/feed`, 5000);
    if (feedRes.ok) {
      const feedText = (await feedRes.text()).slice(0, 20000);
      if (/<generator>\s*Substack\s*<\/generator>/i.test(feedText) || /cdn\.substack\.com/i.test(feedText)) {
        isSubstack = true;
        notes.push("feed:generator_substack");
      } else {
        notes.push("feed:ok_no_match");
      }
    } else {
      notes.push(`feed:http_${feedRes.status}`);
    }
  } catch (e) {
    notes.push(`feed:error_${e.name}`);
  }
 
  if (!isSubstack) {
    try {
      const homeRes = await fetchWithTimeout(`https://${domain}/`, 5000);
      if (homeRes.ok) {
        const html = (await homeRes.text()).slice(0, 50000);
        if (
          /substackcdn\.com/i.test(html) ||
          /content=["']Substack["']/i.test(html) ||
          /substack\.com\/app-link/i.test(html)
        ) {
          isSubstack = true;
          notes.push("homepage:substack_markers");
        } else {
          notes.push("homepage:ok_no_match");
        }
      } else {
        notes.push(`homepage:http_${homeRes.status}`);
      }
    } catch (e) {
      notes.push(`homepage:error_${e.name}`);
    }
  }
 
  return { isSubstack, notes: notes.join("; ") };
}
 
async function handleDomainRequest(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // Throttle the addition requests to max 5 per hour
  // (low-stakes spam abuse prevention, see also CFs WAF -> Rate limiting rules)
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (ip !== "unknown") {
    const throttleKey = `domain-throttle:ip:${ip}`;
    const now = Date.now();
    const raw = await env.HNSUBSTACKS_KV.get(throttleKey);
    // value is an array of timestamps, filter to those in the last hour
    const timestamps = raw ? JSON.parse(raw).filter(t => now - t < 3600000) : [];
    if (timestamps.length >= IP_HOURLY_LIMIT) {
      return jsonResponse({ error: "Too many submissions from this IP, please try again later" }, 429);
    }
    timestamps.push(now);  // Store the filtered array + the new timestamp, discard older entries
    await env.HNSUBSTACKS_KV.put(throttleKey, JSON.stringify(timestamps), { expirationTtl: 3600 });
  }

  // Normalize the domain
  const domain = normalizeDomain(body?.domain);
  if (!domain) {
    return jsonResponse({ error: "Invalid domain." }, 400);
  }
  if (DOMAIN_DENYLIST.has(domain) || domain.endsWith(".substack.com")) {
    return jsonResponse({ error: "That domain doesn't need to be submitted." }, 400);
  }
 
  // Check if a row already exists for that domain
  const existing = await env.DB.prepare(
    "SELECT id, status FROM custom_domains WHERE domain = ?"
  ).bind(domain).first();
  if (existing) {
    const messages = {
      approved: "Already submitted and approved.",
      rejected: "Already submitted and rejected.",
      pending: "Already submitted, pending approval."
    };
    return jsonResponse({ 
      domain, 
      status: existing.status, 
      message: messages[existing.status] || "Already submitted." 
    }, 200);
  }
 
  // Attempt to auto-validate. If that fails, insert as pending for manual approval
  const { isSubstack, notes } = await validateSubstackDomain(domain);
  const now = new Date().toISOString();
  const status = isSubstack ? "approved" : "pending";
  try {
    await env.DB.prepare(
      `INSERT INTO custom_domains (domain, status, auto_validated, validation_notes, submitted_at, validated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(domain, status, isSubstack ? 1 : 0, notes, now, isSubstack ? now : null).run();
  } catch (e) {
    return jsonResponse({ error: "Could not save submission." }, 500);
  }
 
  return jsonResponse({
    domain,
    status,
    message: isSubstack
      ? "Verified automatically and added."
      : "Could not auto-verify; queued for manual review.",
  }, 201);
}

// ---------- flag custom domains ----------

async function handleFlagDomain(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const domain = (body.domain || "").trim().toLowerCase();
  if (!domain) {
    return jsonResponse({ error: "Domain is required" }, 400);
  }
  if (domain === "substack.com" || domain.endsWith(".substack.com")) {
    return jsonResponse({ error: "This domain cannot be flagged" }, 400);
  }

  const row = await env.DB.prepare(
    "SELECT status, auto_validated, flagged FROM custom_domains WHERE domain = ?"
  ).bind(domain).first();

  if (!row) {
    return jsonResponse({ error: "Domain not found" }, 404);
  }
  if (row.status !== "approved" || row.auto_validated !== 1) {
    return jsonResponse({ error: "This domain is not eligible to be flagged" }, 400);
  }
  if (row.flagged === 1) {
    // Already flagged — treat as success, no need to error
    return jsonResponse({ success: true });
  }

  await env.DB.prepare(
    "UPDATE custom_domains SET flagged = 1 WHERE domain = ?"
  ).bind(domain).run();

  return jsonResponse({ success: true });
}

// ---------- fetch handler ----------

export default {
  async fetch(request, env, ctx) {
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

    if (request.method === "POST" && url.pathname === "/api/domains/request") {
      return handleDomainRequest(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/domains/flag") {
      return handleFlagDomain(request, env);
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