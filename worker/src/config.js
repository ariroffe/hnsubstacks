// How many results to fetch from Algolia and store in the KV
export const NEW_STORIES_SAVED = 300;
export const NEW_STORIES_PER_CUSTOM_DOMAIN = 10;  // unlikely to be many for a single custom domain in new

// How many to update every 30 mins
export const NEW_UPDATE_BATCH_SIZE = 90
export const NEW_UPDATE_BATCH_SIZE_PER_DOMAIN = 5

// Best stories
export const BEST_STORIES_SAVED = 900;
export const BEST_STORIES_PER_CUSTOM_DOMAIN = 30;  // there could be more in best
export const BEST_NUM_PAGES = 10;  // Should be a divisor of the two numbers above

// Domains we never accept as "custom domain" submissions because they're
// either the app's own domain, the platform's own domain, or not real hosts.
export const DOMAIN_DENYLIST = new Set(["substack.com", "www.substack.com", "hnsubstacks.com"]);
export const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

// For throttling post requests to add custom domains
export const IP_HOURLY_LIMIT = 5;
