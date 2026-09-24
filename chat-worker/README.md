# chat-worker — Vector chat backend (free tier)

A small Cloudflare Worker that powers the in-site chat. It uses a **D1** database
(Cloudflare's free SQL) — **no Durable Objects**, so it runs on the **free**
Workers plan. Clients poll for new messages every ~2s and post their own;
presence rows drive the who's-online list.

- `/room/public` in the UI → room `public` (the shared lobby).
- a code in the UI → a private room by that code.

## Set it up (all in the browser)

1. **Create the database.** Cloudflare dashboard → **Storage & Databases** →
   **D1 SQL Database** → **Create** → name it `vector-chat`. Copy its
   **Database ID**.
2. **Put the ID in config.** Paste it into `database_id` in `wrangler.toml`
   (replace `PASTE_YOUR_D1_DATABASE_ID_HERE`), commit.
3. **Deploy the Worker.** Dashboard → **Workers & Pages** → **Create** →
   **Workers** → **Import a repository** → pick this repo, set **Root directory**
   to `chat-worker`, deploy. (The tables are created automatically on first use.)
4. **Point the site at it.** The Worker's address shows at the top, like
   `https://vector-chat.<subdomain>.workers.dev`. Set `CHAT_URL` in
   `public/chat.js` to that (https), and redeploy the site.

Optional: put the Worker on a neutral custom domain on your zone (uncomment the
`routes` line in `wrangler.toml`) and use that as `CHAT_URL`, so it's as hard to
block as the rest of the site.

## Notes / limits

Usernames are **not** authenticated — anyone can pick any name, and rooms have no
moderation. Message/name lengths are capped, and the frontend renders messages as
plain text (never HTML). Keep private rooms to codes you only share with people
you trust. Messages are pruned to the most recent ~300 per room.
