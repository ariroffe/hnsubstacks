# hnsubstacks

Hacker News stories from Substack, ordered by score (trending), date or historical points.

## Stack

- **Backend:** Cloudflare Workers
- **Frontend:** Svelte 5 (plain Vite, no SvelteKit), served as static files from the worker
- **Data source:** [HN Algolia API](https://hn.algolia.com/api)
- **Cache:** Cloudflare KV — cached Algolia results
- **Database:** Cloudflare D1 (SQLite) — custom domain allowlist

## Strategy
Using [HN's Algolia API](https://hn.algolia.com/api), a Cloudflare Worker fetches 600 stories (20 pages of results) both by date and by points, by searching for "substack.com" in the url. It then computes the trending stories from the new ones, by simulating HN's score algorithm, and saves all these results (trending, new, historical best) in a KV store with a long TTL. A scheduled task repeats all of this every 10 minutes and overwrites the store.

The Svelte 5 frontend is a static site that just queries the worker and displays the (paginated) results.

## Development
```bash
cd frontend
npm run dev
```

NOTE: To use Vite's dev server (`npm run dev` from above), flip the
`DEBUG` constant to `true` in index.js.
To use a local worker for the api instead of the remote one, flip the `LOCAL` const in api.js to `true`. 
To use a local db instead of the remote one, comment out `remote: true` in wrangler.jsonc.

At some point, I really need to change all this to env vars. 

---

To deploy the changes:

From the frontend dir: `npm run build`. This will generate the
static assets in `worker/public`. 
After that, from worker, run `npm run deploy`. 

NOTE: Make sure that all `DEBUG`, `LOCAL`, etc. constants are set to false before deploying (see above).

---

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


To run the scheduled task and refresh the KV store (only in DEBUG mode):
```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled"
```

## Structure
```

hnsubstacks/
├── frontend/                    Svelte 5 app (source, not deployed directly)
│   ├── public/
│   │   ├── news.css             HN CSS file
│   │   └── hnsubstacks.jpeg     Favicon
│   └── src/
│       ├── App.svelte           Main app
│       ├── lib/
│       │   ├── HnItem.svelte        Story row component
│       │   ├── SubmitDomain.svelte  Custom domain submission form
│       │   └── api.js               API call wrappers
│       └── example-data/        Algolia JSON reponses kept for reference only, unused
│
└── worker/                      Cloudflare Worker (API + static hosting)
    ├── migrations/
    │   ├── 0001_init.sql         D1 migration files
    │   ├── 0002_flagging.sql
    │   └── cheatsheet.txt        Frequently run SQL commands
    ├── public/                   Built frontend static assets (output of npm run build)
    └── src/
        └── index.js              Worker entrypoint — API routes, cron, fetch/store logic
```
