# hnsubstacks

Hacker News stories from Substack, ordered by points or date.

## Stack

- **Frontend:** Svelte 5 (plain Vite, no SvelteKit), deployed on Cloudflare Pages
- **Backend:** Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite) — custom domain allowlist
- **Cache:** Cloudflare KV — cached Algolia results
- **Data source:** HN Algolia API

## Strategy
Using HN's Algolia API I'll fech 600 top and new stories (20 pages of results* for each). I'll save the results (chunked by pages) in a Cloudflare KV store with a TTL of 15 mins. If the cache is empty or expired, the worker will fetch fresh data from the Algolia API, update the KV store, and return the results. 

* At page 20, the More button disappears and the site shows an empty list (HN caps at 30).

## Development
```bash
cd frontend
npm run dev
```

To get the stories from HN (for now):
Ordered by (relevance, points, comments):
```bash
curl "https://hn.algolia.com/api/v1/search?tags=story&restrictSearchableAttributes=url&query=substack.com&hitsPerPage=600" -o stories.json
```

Ordered by date:
```bash
curl "https://hn.algolia.com/api/v1/search_by_date?tags=story&restrictSearchableAttributes=url&query=substack.com&hitsPerPage=600" -o new.json
```

## Structure
```
hnsubstacks/
├── frontend/                 Svelte 5 app
│   ├── public/
│   │   └── news.css          HN CSS file
│   └── src/
│       ├── data/
│       │   └── stories.json  Cached API response (dev only)
│       └── hn-reference/     HN HTML for reference
```
