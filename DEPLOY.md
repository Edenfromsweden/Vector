# Scramjet proxy — deploy & test guide

Educational lab build. Keep it in your own test setup, not on a school network.

## What this repo is

Two halves (this is the whole lesson):

```
 ┌─────────────── Cloudflare Pages (static) ───────────────┐      ┌── Cloudflare Worker ──┐
 │  index.html + Scramjet service worker + WASM rewriter   │      │   Wisp server         │
 │  serves /scram /libcurl /baremux vendor assets          │      │   (relays TCP over WS │
 │  connects out over a Wisp WebSocket  ───────────────────┼─────▶│    via connect())     │
 └─────────────────────────────────────────────────────────┘      └───────────────────────┘
```

- **Frontend** (this repo's `public/`, built into `dist/`) — the page, the service
  worker, the WASM rewriter. Static; can live on any static host.
- **Backend** — a **Wisp** WebSocket server. Cannot be a plain CDN. Here it's a
  **Cloudflare Worker** (`cf-worker/`, from alpgul/worker-wisp-server).

Cloudflare is the host because a domain-category filter can't blocklist Cloudflare
wholesale the way it blocks Render/Fly/Koyeb.

## Two frontends, one source

`public/` is the source of truth. `app/` is the same UI packaged as a single
SVG document, for CDNs that will not serve HTML, and is **generated**:

```bash
npm run build:svg      # public/ -> app/
```

Edit `public/`, never `app/` (see `app/README.md` for the few hand-maintained
exceptions). CI regenerates and fails if `app/` was left stale.

## Render checks

```bash
npm install --no-save playwright
npx playwright install chromium
npm run smoke
```

Loads both builds in a headless browser and asserts the games grid and the
proxy iframe actually render at non-zero size. This catches a failure mode
nothing else does: `app/index.svg` is an XML document, so a node created in the
wrong namespace attaches to the DOM, throws no error, and renders nothing at
all. The page looks fine and every button does nothing.

## Local dev (verified working)

```bash
npm install            # uses pnpm under the hood (Scramjet enforces it) — if npm
                       # is blocked, run: npx pnpm@10.18.3 install
npm start              # Fastify dev server on http://localhost:8080
```

Open `http://localhost:8080` in **real Chrome** (not an embedded webview — service
workers don't register in those), type a URL, hit Enter. In dev, frontend + Wisp run
together on :8080, so `window.WISP_URL` stays "".

## Cloudflare split deploy

### 1. Deploy the Wisp Worker

Easiest (no local tooling): open the one-click deploy and sign into Cloudflare:

https://deploy.workers.cloudflare.com/?url=https://github.com/alpgul/worker-wisp-server

Or from `cf-worker/` with wrangler (**needs Node.js 22+**; this machine has 20):

```bash
cd cf-worker
npx wrangler login        # OAuth in browser
npx wrangler deploy
```

Your Wisp endpoint is then: `wss://wisp-worker.<your-subdomain>.workers.dev/`
(the trailing slash matters).

### 2. Point the frontend at the Worker

Edit `public/wisp-config.js`:

```js
window.WISP_URL = "wss://wisp-worker.<your-subdomain>.workers.dev/";
```

### 3. Build the static frontend

```bash
npm run build:pages      # produces dist/ (public + vendor assets + _headers)
```

### 4. Deploy the frontend to Cloudflare Pages

- **Dashboard route (no Node 22 needed):** push this repo to GitHub, then in the
  Cloudflare dashboard → Pages → connect the repo. Build command `npm run build:pages`,
  output directory `dist`.
- **CLI route (needs Node 22+):** `npm run deploy:pages` (wraps `wrangler pages deploy dist`).

The `dist/_headers` file sets the COOP/COEP headers Scramjet needs (cross-origin
isolation for the WASM rewriter).

### 5. If the free subdomain itself gets blocked

Aggressive filters sometimes block `*.workers.dev` / `*.pages.dev` by name. The fix is
a cheap **custom domain** ($1–12/yr) put behind Cloudflare and used for both Pages and
the Worker route, so traffic looks like an ordinary uncategorized site. That's a
purchase decision — not free.

## Testing it "beats the filter" (Securly stand-in)

Real Securly can't be installed on a personal Chromebook (it's a force-installed,
Workspace-managed extension). Simulate its two mechanisms instead and prove the proxy
loads a site that the mechanism blocks directly:

1. **Network/DNS layer** — your dad's VLAN domain blocklist, or a Pi-hole/DNS blocklist
   that blocks e.g. `reddit.com`. Confirm `reddit.com` is blocked directly, then loads
   through the proxy.
2. **On-device URL layer** — install an open-source URL-blocking Chrome extension as the
   Securly stand-in; same test.

If the proxy loads the "blocked" site, you've demonstrated the real evasion mechanism.

## Honest limits (what won't work, and why)

- **No UDP** (Cloudflare `connect()` is TCP-only) → **Discord voice / any WebRTC is
  impossible**. Discord text/login can work.
- **6 concurrent outbound TCP sockets per Wisp connection** (Cloudflare-wide, all plans)
  → heavy sites that open many parallel connections queue and feel slow.
- **Free CPU budget 10 ms/request** (I/O-bound relay, fine for browsing; sustained bulk
  transfer can hit Error 1102 → needs a Paid plan). Free-tier ToS disallows running it as
  a video/streaming CDN.
- **Roblox gameplay is not a website** — it's a separate player app, so proxying
  roblox.com never yields gameplay. The site pages can load.
- **Datacenter-IP blocking** — Roblox/Discord sometimes refuse Cloudflare/datacenter IPs.
  A refused connection there is a real-world finding, not a bug.

## File map (what was added on top of the template)

- `public/wisp-config.js` — sets `window.WISP_URL` (empty = same-origin dev).
- `public/index.js` — patched to honor `window.WISP_URL`.
- `public/index.html` — loads `wisp-config.js` before `index.js`.
- `scripts/build-pages.mjs` — builds `dist/` for static hosting + `_headers`.
- `cf-worker/` — the Cloudflare Worker Wisp server (upstream alpgul/worker-wisp-server).
