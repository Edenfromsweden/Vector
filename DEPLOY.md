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

## If a link gets blocked (layered fallback)

Three layers, cheapest first:

1. **One subdomain blocked** -> use the next one. That is what the several
   `*.zilkcz.com` routes are for; switching is instant, nothing to deploy.

2. **The whole `zilkcz.com` zone blocked** -> the Worker is also served at
   `vector-site.<your-account>.workers.dev` (`workers_dev = true`), on
   Cloudflare's own domain, which a zilkcz.com block does not touch.
   `npx wrangler deploy` prints the exact URL -- note it down now, while
   everything works, so you have it when you need it. A filter may block
   workers.dev by category, so treat it as a backstop, not the main plan.

3. **Durable whole-zone fallback** -> a second domain on the same Cloudflare
   account. Add its subdomains to `routes` in `wrangler.toml` exactly like the
   zilkcz.com ones and redeploy; same Worker, same build. This is the only
   layer that fully survives losing zilkcz.com, because it does not depend on
   it at all. A cheap second domain is the highest-value thing to add here.

Note: statically.io (and githack, jsDelivr) cannot be a fallback that _runs_
the app -- they serve the page as text or block its scripts. Verified across
.html, .xhtml and .svg. The frontend only runs where a real web host serves
it, which is what these Cloudflare hostnames are.

## Connect the repo to Cloudflare Pages (auto-deploy)

The hands-off way to deploy: connect this GitHub repo to a Cloudflare Pages
project once, and every push rebuilds and redeploys automatically. Cloudflare
talks to GitHub from its own servers, so this works even where GitHub is
blocked on your network, and it needs no API token and no local tooling.

One-time setup (all in the browser):

1. Cloudflare dashboard -> **Workers & Pages** -> **Create** -> **Pages** ->
   **Connect to Git** -> authorize GitHub -> pick the **Vector** repo, branch
   `main`.
2. Build settings:
   - Framework preset: **None**
   - Build command: `npm run build:pages`
   - Build output directory: `dist`
   - (Node version is pinned by `.node-version` = 22; nothing to set.)
3. **Save and Deploy.** The first build runs; you get a `*.pages.dev` URL.

After it builds, add your domain: the Pages project -> **Custom domains** ->
add `v.zilkcz.com` (remove it from the old `vector-site` Worker first, under
that Worker's Settings -> Domains & Routes, or use a spare subdomain to test).

From then on: I push a change, Cloudflare rebuilds, the site updates. Nothing
for you to upload.

## Making more links (extra subdomains)

Every hostname in `vector-site/wrangler.toml` is served by the one Worker from
the same build, so each is a complete, independent link to the app. They are
`custom_domain` routes, so Cloudflare creates the DNS for each automatically on
deploy -- no manual DNS.

Add a link:

1. Add one line to the `routes` list in `vector-site/wrangler.toml`, e.g.
   `{ pattern = "library.zilkcz.com", custom_domain = true },`
2. `npm run deploy:site` (builds `dist/` and deploys the Worker)

That is it -- `https://library.zilkcz.com` now serves the app.

Retire a blocked link: delete its line, `npm run deploy:site`, then remove its
DNS record in the Cloudflare dashboard (Websites -> zilkcz.com -> DNS).

Naming: a content filter categorises by hostname, so plain, boring names
(`docs`, `read`, `go`, `notes`, `study`) last far longer than obvious ones
(`proxy`, `unblock`, `vpn`). Keep a couple in reserve so a fresh link is one
redeploy away when one gets caught.

Requirements: the `zilkcz.com` zone must be on the same Cloudflare account as
the Worker (it is -- that is how `v.zilkcz.com` auto-created its DNS), and
`npx wrangler login` must have been run once on the machine you deploy from.

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

- **Can't reach Cloudflare-hosted sites** — a Worker's `connect()` refuses to open a
  socket to Cloudflare's own IP ranges (loop prevention), so any Cloudflare-fronted
  target returns a network error. That includes **Discord**, **Twitter / X**, and
  `example.com` (now on Cloudflare). Sites on their own infra (Google, YouTube, Reddit,
  GitHub, Wikipedia, …) work. This is the single biggest limit of a Worker backend, and
  the only fix is to run the Wisp server off Cloudflare — a small `wisp-js` Node server
  on any host, reverse-proxied behind your domain — which does normal OS-level TCP with
  no such restriction.
- **No UDP** (Cloudflare `connect()` is TCP-only) → **Discord voice / any WebRTC is
  impossible** (and Discord is unreachable anyway, see above).
- **6 concurrent outbound TCP sockets per Wisp connection** (Cloudflare-wide, all plans)
  → heavy sites that open many parallel connections queue and feel slow.
- **Free CPU budget 10 ms/request** (I/O-bound relay, fine for browsing; sustained bulk
  transfer can hit Error 1102 → needs a Paid plan). Free-tier ToS disallows running it as
  a video/streaming CDN.
- **Roblox gameplay is not a website** — it's a separate player app, so proxying
  roblox.com never yields gameplay. The site pages can load.
- **Datacenter-IP blocking** — Roblox/Discord sometimes refuse Cloudflare/datacenter IPs.
  A refused connection there is a real-world finding, not a bug.

## Switchable backend (`public/wisp-config.js`)

The frontend picks its Wisp server at load time, so you can reach Cloudflare-fronted
sites without redeploying:

| backend  | URL                              | reaches Discord / X / Cloudflare sites |
| -------- | -------------------------------- | -------------------------------------- |
| `worker` | `wss://wisp.zilkcz.com/`         | no (Worker `connect()` limit)          |
| `public` | `wss://anura.pro/`               | yes — shared, unreliable, not private  |
| `mine`   | `wss://wisp2.zilkcz.com/wisp/`   | yes — your own server (set up below)   |

Choose with `?backend=<name>` in the URL (remembered in localStorage) or
`setBackend("<name>")` in the console. Default is `worker`; localhost dev ignores
this and uses its same-origin server.

## Your own Wisp backend on a DigitalOcean droplet (the `mine` backend)

This is the reliable, private way to reach Discord (text/login — voice is UDP and
never works). The repo already **is** a Wisp server (`npm start`, `src/index.js`);
this just runs it on an always-on box. We front it with a Cloudflare **Tunnel** so
there are no open ports, no origin TLS certificate to manage, the edge-to-origin hop
is encrypted, and the public URL sits on `zilkcz.com` (as hard to block as the Worker).

1. **Create the droplet.** DigitalOcean → Create → Droplet → Ubuntu 24.04, Basic,
   the cheapest size is plenty (a Wisp relay is I/O-bound), add your SSH key.

2. **Install Node + the server.** SSH in (`ssh root@<droplet-ip>`), then:

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
   apt-get install -y nodejs git
   npm install -g pnpm
   git clone https://github.com/Edenfromsweden/Vector
   cd Vector && pnpm install
   ```

   Optional: `src/index.js` sets `hostname_blacklist: [/example\.com/]` and family-filter
   DNS (`1.1.1.3`). On your own box you can drop the blacklist and use `1.1.1.1` for
   unfiltered DNS.

3. **Run it as a service** so it survives reboots. Create `/etc/systemd/system/wisp.service`:

   ```ini
   [Unit]
   Description=Vector Wisp server
   After=network.target
   [Service]
   WorkingDirectory=/root/Vector
   Environment=PORT=8080
   ExecStart=/usr/bin/npm start
   Restart=always
   [Install]
   WantedBy=multi-user.target
   ```

   Then `systemctl enable --now wisp`. It now serves Wisp at `ws://localhost:8080/wisp/`.

4. **Expose it with a Cloudflare Tunnel** (no port-forwarding, no public port open):

   ```bash
   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cf.deb
   dpkg -i cf.deb
   cloudflared tunnel login                 # opens a link; pick the zilkcz.com zone
   cloudflared tunnel create vector-wisp
   cloudflared tunnel route dns vector-wisp wisp2.zilkcz.com
   ```

   Create `~/.cloudflared/config.yml`:

   ```yaml
   tunnel: vector-wisp
   credentials-file: /root/.cloudflared/<tunnel-id>.json
   ingress:
     - hostname: wisp2.zilkcz.com
       service: http://localhost:8080
     - service: http_status:404
   ```

   Then install it as a service: `cloudflared service install && systemctl enable --now cloudflared`.

5. **Use it.** `wisp-config.js` already has `mine: "wss://wisp2.zilkcz.com/wisp/"`.
   Visit `https://v.zilkcz.com/?backend=mine` (or `setBackend("mine")`), then load
   Discord. To make it the default, move `mine` to `DEFAULT` in `wisp-config.js`.

Cost is the droplet only (~$4–6/mo). The tunnel and the `zilkcz.com` hostname are free.
Datacenter IPs occasionally get challenged by Discord; if a site refuses the connection
that's an IP-reputation issue, not a bug.

## File map (what was added on top of the template)

- `public/wisp-config.js` — picks the Wisp backend (worker/public/mine) and sets
  `window.WISP_URL` (empty = same-origin dev).
- `public/index.js` — patched to honor `window.WISP_URL`.
- `public/index.html` — loads `wisp-config.js` before `index.js`.
- `scripts/build-pages.mjs` — builds `dist/` for static hosting + `_headers`.
- `cf-worker/` — the Cloudflare Worker Wisp server (upstream alpgul/worker-wisp-server).
