# hnsubstacks

Hacker News stories from Substack, ordered by score (trending), date or historical points.

## Stack

- **Frontend:** Svelte 5 (plain Vite, no SvelteKit), deployed on Cloudflare Pages
- **Backend:** Cloudflare Workers
- **Cache:** Cloudflare KV — cached Algolia results
- **Data source:** HN Algolia API
- **Database:** Cloudflare D1 (SQLite) — custom domain allowlist

## Strategy
Using [HN's Algolia API](https://hn.algolia.com/api), fetch 600 stories (20 pages of results) both by date and by points. Compute the trending stories from the new ones, by simulating HN's score algorithm. Save all these results (trending, new, historical best) in a KV store with a long TTL. A scheduled task repeats all of this every 10 minutes. 

The Svelte 5 frontend is a static site that just queries the worker and displays the (paginated) results.

## Development
```bash
cd frontend
npm run dev
```

To get the stories from HN, I'm querying the following two endpoints:

Ordered by date (new):
```bash
curl "https://hn.algolia.com/api/v1/search_by_date?tags=story&restrictSearchableAttributes=url&query=substack.com&hitsPerPage=600" -o new.json
```

Ordered by points (best):
```bash
curl "https://hn.algolia.com/api/v1/search?tags=story&restrictSearchableAttributes=url&query=substack.com&hitsPerPage=600" -o stories.json
```

Trending stories (hot) are reconstructed from new by computing (an approximation) of the HN score in the worker, with the algorithm:
```
score = (points - 1) / (age_in_hours + 2) ^ gravity 
```
(gravity is set to 1.8).


To refresh the KV store (only in DEBUG mode):
```bash
curl https://worker.hnsubstacks.workers.dev/api/refresh
```

## Structure (todo UPDATE!)
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
