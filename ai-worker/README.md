# ai-worker — Vector AI backend

A Cloudflare Worker that powers the in-site AI chatbot using **Cloudflare
Workers AI** — free up to a daily allowance, and **no API key** (the model runs
on the Worker's `AI` binding). It enforces a **per-user daily token cap** stored
in **D1**, keyed by the UTC day, so it resets at 00:00 UTC — the same time
Cloudflare's free AI quota resets.

- `POST /api/chat` `{ messages: [{role, content}, ...] }` → `{ reply, used, limit }`
- Over the cap → HTTP 429 with a friendly message.

## Set it up (browser)

1. **Create the usage database.** Dashboard → **Storage & Databases** → **D1** →
   **Create** → name it `vector-ai`. Copy its **Database ID** into `database_id`
   in `wrangler.toml`.
2. **Deploy the Worker.** Dashboard → **Workers & Pages** → **Create** →
   **Workers** → **Import a repository** → this repo, **Root directory** =
   `ai-worker`, deploy. Workers AI (`[ai]` binding) works with no extra setup.
3. **Point the site at it.** Set `AI_URL` in `public/ai.js` to the Worker's
   `https://…workers.dev` address (or a custom domain if you add one), and
   redeploy the site.

## Tuning the limit

`DAILY_LIMIT` in `src/index.js` is the per-user token budget per UTC day
(default 20,000). Lower it to be stricter, raise it to be more generous. Usage
is tracked per client IP; there are no accounts, so it's a soft cap, not
airtight — good enough to keep any one person from burning the whole daily
Workers AI allowance.

## Model

Uses `@cf/meta/llama-3.1-8b-instruct`. Swap `MODEL` in `src/index.js` for any
other [Workers AI text model](https://developers.cloudflare.com/workers-ai/models/).
