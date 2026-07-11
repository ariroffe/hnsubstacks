# hnsubstacks

Hacker News stories from Substack, ordered by score (trending), date or historical points.

[https://hnsubstacks.com](https://hnsubstacks.com)

## Stack

- **Backend:** Cloudflare Workers
- **Frontend:** Svelte 5 (plain Vite, no SvelteKit), served as static files from the worker
- **Data source:** [HN Algolia API](https://hn.algolia.com/api)
- **Cache:** Cloudflare KV — cached Algolia results
- **Database:** Cloudflare D1 (SQLite) — custom domain allowlist

## Strategy
I use [HN's Algolia API](https://hn.algolia.com/api) to fetch substack stories by searching for "substack.com" in the url.

I do this via a CloudFlare worker that has 4 separate cron triggers:
- The first fetches stories that are newer than those seen in the previous run. It does so every 10 minutes. It then merges the results with those of the previous runs, dedupes, and stores again.
- The second updates the 90 top ranked (already stored) new stories, of the last 48hs. It does so every 30 mins. This is so that the stories outside the latest 10 min window have accurate points for the computation of hot stories.
- The third runs 2 minutes after the first and 2 minutes after the second. It computes hot stories from new ones, by simulating HN's score algorithm, and stores that on the KV.
- The last runs once every hour and computes the best stories (historically, ordered by points). Incremental version is paginated (fetches a page, merges, dedupes, and stores). 

I store 300 new stories (10 pages of results) and 900 best (30 pages).

A previous, simpler, version queried for new/best 600 results every 10 minutes, and computed hot, all under the same cron trigger; but that exceeded CloudFlare's free limit of 10ms of CPU time; and I want to keep this free. Plus, optimizing it was also fun.

The Svelte 5 frontend is a static site that just queries the worker and displays the (paginated) results.

## Development

```bash
cd worker
npm run dev
```

In a separate console:

```bash
cd frontend
npm run dev
```

Then navigate to http://localhost:5173/

**NOTE:** The dev server uses the remote db. To use a local db instead of the remote one (which you'll need because your wrangler tool isn't logged in to my CloudFlare account), comment out `remote: true` in wrangler.jsonc.

---

To get the stories from HN, I'm querying the following two endpoints:

Ordered by date (new):
```bash
curl "https://hn.algolia.com/api/v1/search_by_date?tags=story&restrictSearchableAttributes=url&query=substack.com&hitsPerPage=300&numericFilters=created_at_i>[[TIMESTAMP]]"
```

Ordered by points (best):
```bash
curl "https://hn.algolia.com/api/v1/search?tags=story&restrictSearchableAttributes=url&query=substack.com&hitsPerPage=90&page=[[PAGE]]"
```

Trending stories (hot) are reconstructed from new by computing (an approximation) of the HN score in the worker, with the algorithm:
```
score = (points - 1) / (age_in_hours + 2) ^ gravity 
```
(gravity is set to 1.8).


To refresh the KV store locally (only in dev mode):
```bash
curl "http://localhost:8787/api/refresh"
```

## Deploying

```bash
cd frontend
npm run dev
```

```bash
cd worker
npm run deploy
```

## Structure
```

hnsubstacks/
├── frontend/                    Svelte 5 app
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
    ├── migrations/               D1 migration files
    │   ├── 0001_init.sql
    │   ├── 0002_flagging.sql
    │   └── cheatsheet.txt        Frequently run SQL commands
    ├── public/                   Built frontend static assets (output of npm run build)
    └── src/
        ├── config.js             Configuration variables for the entire backend
        ├── helpers.js            Helper functions
        ├── newAndHotStories.js   Fetch and store new/hot stories
        ├── bestStories.js        Fetch and store best stories
        ├── postHandlers.js       Custom domain submission and url flagging
        └── index.js              Worker entrypoint — API routes, cron
```

## Contributing

Please submit any issues you find via GitHub's Issues page. 

**This is a side project** that I made over a weekend. Although I will fix issues and keep maintaining it, I'm not going to be able to dedicate a lot of time to it, so I'm not planning on adding new features. If there's something that you feel would really benefit this site, please discuss it in Issues before getting to work and making a pull request.