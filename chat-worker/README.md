# chat-worker — Vector chat backend

A tiny Cloudflare Worker that powers the in-site chat. Each room is a
[Durable Object](https://developers.cloudflare.com/durable-objects/); it relays
WebSocket messages between everyone in that room and keeps the last ~50 messages
so new joiners see recent history.

- `/room/public` — the shared public lobby.
- `/room/<code>` — a private room; friends join by sharing the code.

## Deploy

Durable Objects need the **Workers Paid** plan.

```bash
cd chat-worker
npx wrangler login      # once
npx wrangler deploy
```

That prints a URL like `https://vector-chat.<subdomain>.workers.dev/`. Point the
frontend at it: set `CHAT_URL` in `public/chat.js` to the `wss://` form, e.g.

```js
const CHAT_URL = "wss://vector-chat.<subdomain>.workers.dev/";
```

Or, to make it as hard to block as the rest of the site, put it on a custom
domain on your zone: uncomment the `routes` line in `wrangler.toml`, set your own
hostname (e.g. `chat.zilkcz.com`), re-deploy, and use `wss://chat.zilkcz.com/`.

## Notes / limits

Usernames are **not** authenticated — anyone can pick any name, and rooms have no
moderation. Message and name lengths are capped and there's a basic per-connection
rate limit, and the frontend renders messages as plain text (never HTML). Keep
private rooms to codes you only share with people you trust.
