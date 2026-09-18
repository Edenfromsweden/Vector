<h1 align="center">Vector</h1>

<p align="center">A straight line to the open web.</p>

Vector is a self-hosted web proxy front end built on
[Scramjet](https://github.com/MercuryWorkshop/scramjet). You host it on your own
Cloudflare account; it serves a small browser-style UI (address bar, tabs, a
games grid) and routes pages through a Wisp WebSocket backend.

It is an educational project for learning how interception proxies, service
workers, and request rewriting fit together. Run it on infrastructure you
control and on networks where you are permitted to.

## How it is put together

```
 ┌─────────── Cloudflare Worker (vector-site/) ───────────┐      ┌─── Wisp backend ───┐
 │  serves the static build (dist/) with COOP/COEP        │      │  relays TCP over a │
 │  the page + Scramjet service worker + WASM rewriter    │ ───▶ │  WebSocket via     │
 │  reachable at v.zilkcz.com and sibling subdomains      │      │  connect()         │
 └────────────────────────────────────────────────────────┘      └────────────────────┘
```

- **Front end** — `public/` is the source of truth: the page, service worker,
  and client scripts. `scripts/build-pages.mjs` builds it into `dist/` with the
  vendored engine and the cross-origin-isolation headers Scramjet needs.
- **CDN shells** — `app/` is the same UI packaged for static CDNs, generated
  from `public/` by `scripts/build-svg-shell.mjs` (see `app/README.md`). Kept
  for hosts that will not run a normal page; the Cloudflare deploy does not need
  them.
- **Backend** — a Wisp WebSocket server. `src/index.js` runs one for local dev;
  `cf-worker/` is a Cloudflare Worker version. It cannot be a plain CDN.

## Local development

```bash
npm install        # uses pnpm under the hood; if npm is blocked:
                   #   npx pnpm@10.18.3 install
npm start          # dev server on http://localhost:8080
```

Open it in real Chrome (not an embedded webview — service workers do not
register in those), type a URL, press Enter. In dev the front end and Wisp run
together, so `window.WISP_URL` in `public/wisp-config.js` stays `""`.

## Deploying (Cloudflare)

The front end and the Wisp backend deploy separately. Full walkthrough in
[`DEPLOY.md`](DEPLOY.md); the short version:

```bash
npm run deploy:site    # build dist/ and deploy the Worker (front end)
```

Every hostname listed in `vector-site/wrangler.toml` is served by that one
Worker, so each is an independent link. Add a line, redeploy, and you have
another. `DEPLOY.md` covers minting and retiring links, the workers.dev
backstop, and a second-domain fallback.

## Games

`public/games/` holds standalone HTML games; `npm run games` regenerates
`games.json` from whatever is in there. Clicking a game navigates to its file
(it is not framed — the game hosts refuse embedding), and Back returns to
Vector.

## Checks

```bash
npm run lint
npm install --no-save playwright && npx playwright install chromium
npm run smoke      # loads every build in a headless browser and asserts it renders
```

`npm run smoke` catches failures that unit tests miss — a control that is in the
DOM but renders at zero size, a page that loads but runs no script, an overlay
covering the app. CI (`.github/workflows/build.yml`) runs it and also checks
`app/` is regenerated from `public/`.

## Limits (what will not work, and why)

- **Cloudflare-fronted sites** may fail: the Worker backend reaches the network
  through `connect()`, which is restricted from connecting into Cloudflare's own
  IP ranges. A non-Worker Wisp host avoids this.
- **CAPTCHAs / "Just a moment…"** happen because TLS is terminated in-browser by
  a WASM stack whose fingerprint does not match the browser, from datacenter IP
  space. Hosting the Wisp server on a clean, non-datacenter IP helps.
- **Static CDNs cannot host the front end.** jsDelivr and statically.io serve
  pages as plain text or block their scripts (verified across `.html`, `.xhtml`,
  and `.svg`); githack works but is easily blocked. A real web host — the
  Cloudflare Worker here — is what actually runs it.

## Credits & license

Built on [Scramjet](https://github.com/MercuryWorkshop/scramjet) and the Mercury
Workshop toolchain (bare-mux, libcurl-transport, wisp-js). Licensed under the
GNU AGPL — see [`LICENSE`](LICENSE).
