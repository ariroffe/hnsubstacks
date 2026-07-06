// How many results to fetch from Algolia and store in the KV
export const BASE_NUM_RESULTS = 300;

// Domains we never accept as "custom domain" submissions because they're
// either the app's own domain, the platform's own domain, or not real hosts.
export const DOMAIN_DENYLIST = new Set(["substack.com", "www.substack.com", "hnsubstacks.com"]);
export const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

// For throttling post requests to add custom domains
export const IP_HOURLY_LIMIT = 5;
