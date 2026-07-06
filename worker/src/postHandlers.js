import { normalizeDomain, fetchWithTimeout, jsonResponse } from "./helpers.js"; 
import { DOMAIN_DENYLIST, IP_HOURLY_LIMIT } from "./config.js";


// ---------- custom domain submission ----------
 
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
 
export async function handleDomainRequest(request, env) {
  // For dev mode
  const DEBUG = env.DEBUG === "true";
  const CORS_HEADERS = DEBUG ? {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  } : {}

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, CORS_HEADERS);
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
      return jsonResponse({ error: "Too many submissions from this IP, please try again later" }, 429), CORS_HEADERS;
    }
    timestamps.push(now);  // Store the filtered array + the new timestamp, discard older entries
    await env.HNSUBSTACKS_KV.put(throttleKey, JSON.stringify(timestamps), { expirationTtl: 3600 });
  }

  // Normalize the domain
  const domain = normalizeDomain(body?.domain);
  if (!domain) {
    return jsonResponse({ error: "Invalid domain." }, 400, CORS_HEADERS);
  }
  if (DOMAIN_DENYLIST.has(domain) || domain.endsWith(".substack.com")) {
    return jsonResponse({ error: "That domain doesn't need to be submitted." }, 400, CORS_HEADERS);
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
    }, 200, CORS_HEADERS);
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
    return jsonResponse({ error: "Could not save submission." }, 500), CORS_HEADERS;
  }
 
  return jsonResponse({
    domain,
    status,
    message: isSubstack
      ? "Verified automatically and added."
      : "Could not auto-verify; queued for manual review.",
  }, 201, CORS_HEADERS);
}

// ---------- flag custom domains ----------

export async function handleFlagDomain(request, env) {
  // For dev mode
  const DEBUG = env.DEBUG === "true";
  const CORS_HEADERS = DEBUG ? {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  } : {}

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400, CORS_HEADERS);
  }

  const domain = (body.domain || "").trim().toLowerCase();
  if (!domain) {
    return jsonResponse({ error: "Domain is required" }, 400, CORS_HEADERS);
  }
  if (domain === "substack.com" || domain.endsWith(".substack.com")) {
    return jsonResponse({ error: "This domain cannot be flagged" }, 400, CORS_HEADERS);
  }

  const row = await env.DB.prepare(
    "SELECT status, auto_validated, flagged FROM custom_domains WHERE domain = ?"
  ).bind(domain).first();

  if (!row) {
    return jsonResponse({ error: "Domain not found" }, 404, CORS_HEADERS);
  }
  if (row.status !== "approved" || row.auto_validated !== 1) {
    return jsonResponse({ error: "This domain is not eligible to be flagged" }, 400, CORS_HEADERS);
  }
  if (row.flagged === 1) {
    // Already flagged — treat as success, no need to error
    return jsonResponse({ success: true }, 200, CORS_HEADERS );
  }

  await env.DB.prepare(
    "UPDATE custom_domains SET flagged = 1 WHERE domain = ?"
  ).bind(domain).run();

  return jsonResponse({ success: true }, 200, CORS_HEADERS);
}