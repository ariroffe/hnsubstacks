# hnsubstacks

Hacker News stories from Substack, ordered by points or date.

## Stack
- Svelte 5 (plain Vite, no SvelteKit)
- Cloudflare Pages (hosting)
- HN Algolia API (data source)

## Development
cd frontend
npm run dev

## Structure
frontend/                        Svelte 5 app
frontend/public/news.css         HN CSS file
frontend/src/data/stories.json   Cached API response (dev only)
frontend/src/hn-reference/       HN HTML for reference
