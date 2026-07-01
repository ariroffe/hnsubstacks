# hnsubstacks

Hacker News stories from Substack, ordered by points or date.

## Stack

- **Frontend:** Svelte 5 (plain Vite, no SvelteKit), deployed on Cloudflare Pages
- **Backend:** Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite) — custom domain allowlist
- **Cache:** Cloudflare KV — cached Algolia results
- **Data source:** HN Algolia API

## Development
```bash
cd frontend
npm run dev
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
