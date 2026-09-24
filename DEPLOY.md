# Scramjet proxy — deploy & test guide

Educational lab build. Keep it in your own test setup, not on a school network.

## What this repo is

Two halves (this is the whole lesson):

```
 ┌────────── Cloudflare Worker: "vector" (static) ─────────┐      ┌── Cloudflare Worker ──┐
 │  index.html + Scramjet service worker + WASM rewriter   │      │   Wisp server         │
 │  serves /cdn/scram /cdn/libcurl /cdn/baremux (in app/)  │      │   (relays TCP over WS │
 │  connects out over a Wisp WebSocket  ───────────────────┼─────▶│    via connect())     │
 └─────────────────────────────────────────────────────────┘      └───────────────────────┘
```

- **Frontend** — the `app/` folder (the page, the service worker, the WASM
  rewriter, engine vendored under `app/cdn/`). Fully static; served as-is by an
  assets-only Cloudflare Worker named `vector`.
- **Backend** — a **Wisp** WebSocket server. Cannot be a plain CDN. Here it's a
  **Cloudflare Worker** (`cf-worker/`, from alpgul/worker-wisp-server).

Cloudflare is the host because a domain-category filter can't blocklist Cloudflare
wholesale the way it blocks Render/Fly/Koyeb.

## One source, generated shell

`public/` is the source of truth and what `npm start` serves in local dev.
`app/` is the same UI packaged for static hosting (a self-contained folder with
the engine vendored under `app/cdn/`, plus an `.svg`/`.xhtml` variant for CDNs
that refuse to serve `.html`), and it is **generated**:

```bash
npm run build:svg      # public/ -> app/
```

Edit `public/`, never `app/` (see `app/README.md` for the few hand-maintained
exceptions). CI regenerates and fails if `app/` was left stale. The deployed
Worker serves `app/`.

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
together on :8080, so `window.EP_URL` stays "".

## Deploy (Cloudflare Workers)

Two Workers on your Cloudflare account: **`vector`** (the frontend, serves
`app/`) and **`wisp-worker`** (the Wisp backend). Both are hard for a
domain-category filter to blocklist, which is the whole point of hosting here.

### 1. The Wisp backend Worker

Deploy `cf-worker/` (**needs Node.js 22+**):

```bash
cd cf-worker
npx wrangler login        # OAuth in browser, once
npx wrangler deploy
```

It's served at `wss://relay.zilkcz.com/` (a deliberately neutral custom domain —
the older `wss://wisp.zilkcz.com/` still works too), with a
`wss://wisp-worker.<your-subdomain>.workers.dev/` fallback. The frontend already
points at `relay` — see the backend table below — so there's nothing to edit.

### 2. The frontend Worker

The `vector` Worker is **connected to this GitHub repo** (Workers Builds), so
every push to `main` rebuilds and redeploys automatically — Cloudflare pulls
from GitHub on its own servers, so this works even where GitHub is blocked on
your network. The repo-root [`wrangler.jsonc`](../wrangler.jsonc) is what makes
it work: an assets-only Worker that serves `app/` with no build step.

- The `name` in `wrangler.jsonc` **must** match the Worker (`vector`).
- Set the production deploy command to `npx wrangler deploy` (not
  `wrangler versions upload`, which uploads a version without making it live).

To deploy by hand instead of via git: `npm run deploy` (runs `wrangler deploy`
against the root config).

### 3. Links and blocked links

The site is a normal Worker, so each **custom domain** you attach to it is a
complete, independent link. Add or remove them in the dashboard: the `vector`
Worker → **Settings → Domains & Routes**. Cloudflare creates the DNS
automatically for a custom domain on the `zilkcz.com` zone.

If a link gets blocked, attach a fresh custom domain and hand out the new one —
nothing to rebuild. Keep a couple of spares ready. A content filter categorises
by hostname, so plain, boring names (`docs`, `read`, `go`, `notes`, `study`,
`lobster`) last far longer than obvious ones (`proxy`, `unblock`, `vpn`). The
`*.workers.dev` URL is a backstop on Cloudflare's own domain that a block of the
whole `zilkcz.com` zone doesn't touch — but a filter may block workers.dev by
category, so treat it as a backup, not the main plan.

Note: statically.io / githack / jsDelivr cannot be a fallback that _runs_ the
app — they serve the page as text or block its scripts (verified across `.html`,
`.xhtml`, `.svg`). The frontend only runs where a real web host serves it.

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

## Switchable backend (`public/endpoint.js`)

The frontend picks its Wisp server at load time, so you can reach Cloudflare-fronted
sites without redeploying:

| backend  | URL                              | reaches Discord / X / Cloudflare sites |
| -------- | -------------------------------- | -------------------------------------- |
| `worker` | `wss://relay.zilkcz.com/`        | no (Worker `connect()` limit)          |
| `public` | `wss://anura.pro/`               | yes — shared, unreliable, not private  |
| `mine`   | `wss://relay2.zilkcz.com/ws/`   | yes — your own server (set up below)   |

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

   Then `systemctl enable --now wisp`. It now serves Wisp at `ws://localhost:8080/ws/`.

4. **Expose it with a Cloudflare Tunnel** (no port-forwarding, no public port open):

   ```bash
   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cf.deb
   dpkg -i cf.deb
   cloudflared tunnel login                 # opens a link; pick the zilkcz.com zone
   cloudflared tunnel create vector-relay
   cloudflared tunnel route dns vector-relay relay2.zilkcz.com
   ```

   Create `~/.cloudflared/config.yml`:

   ```yaml
   tunnel: vector-relay
   credentials-file: /root/.cloudflared/<tunnel-id>.json
   ingress:
     - hostname: relay2.zilkcz.com
       service: http://localhost:8080
     - service: http_status:404
   ```

   Then install it as a service: `cloudflared service install && systemctl enable --now cloudflared`.

5. **Use it.** `endpoint.js` already has `mine: "wss://relay2.zilkcz.com/ws/"`.
   Visit `https://lobster.zilkcz.com/?backend=mine` (or `setBackend("mine")`), then
   load Discord. To make it the default, move `mine` to `DEFAULT` in `endpoint.js`.
   (Keep the hostname boring — a neutral name draws less attention.)

Cost is the droplet only (~$4–6/mo). The tunnel and the `zilkcz.com` hostname are free.
Datacenter IPs occasionally get challenged by Discord; if a site refuses the connection
that's an IP-reputation issue, not a bug.

## File map (what was added on top of the template)

- `public/endpoint.js` — picks the Wisp backend (worker/public/mine) and sets
  `window.EP_URL` (empty = same-origin dev).
- `public/index.js` — patched to honor `window.EP_URL`.
- `public/index.html` — loads `endpoint.js` before `index.js`.
- `scripts/build-svg-shell.mjs` — generates `app/` (the deployed frontend) from `public/`.
- `wrangler.jsonc` — root config for the `vector` frontend Worker (serves `app/`).
- `cf-worker/` — the Cloudflare Worker Wisp server (upstream alpgul/worker-wisp-server).
