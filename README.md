<p align="center">
	<img src="assets/vector-logo.png" width="120" alt="Vector">
</p>

<h1 align="center">Vector</h1>

<p align="center">A straight line to the open web.</p>

<p align="center">
	Vector is an educational web proxy built on
	<a href="https://github.com/MercuryWorkshop/scramjet">Scramjet</a> — fast,
	self-hosted, and designed to be easy to put online and keep online.
</p>

## Supported sites

Vector works with most of the web, including:

- Google
- YouTube
- Reddit
- Spotify
- Instagram
- GitHub

## Known limits

The default backend is a **Cloudflare Worker**, and Cloudflare Workers can't
open a connection to a site that is itself hosted on Cloudflare (the platform
blocks it to prevent loops). So any Cloudflare-fronted site returns a network
error — for example **Discord**, **Twitter / X**, and even `example.com`, which
now sits behind Cloudflare. Sites on their own infrastructure (the list above)
work fine; Wikipedia is the quickest thing to test with.

This is a hosting limit, not a bug in the proxy. Reaching Cloudflare-fronted
sites means running the Wisp backend somewhere other than a Worker — a small
Node server on any host, reverse-proxied behind your domain. See
[`DEPLOY.md`](DEPLOY.md).

## Hosting a link

### Local

```bash
git clone https://github.com/Edenfromsweden/Vector
cd Vector
npm install
npm start
```

Then open <http://localhost:8080> in real Chrome (not an embedded webview).

### Web (Cloudflare)

Vector runs on your own Cloudflare account. Deploy the front end with:

```bash
npm run deploy:site
```

Every hostname in `vector-site/wrangler.toml` becomes a working link — add a
line and redeploy to mint another, so you always have a spare when one gets
blocked. Full walkthrough, including the backend and fallbacks, in
[`DEPLOY.md`](DEPLOY.md).

<p align="center">
	<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/alpgul/worker-wisp-server">
		<img src="https://deploy.workers.cloudflare.com/button" alt="Deploy the Wisp backend to Cloudflare">
	</a>
</p>

## Layout

- `public/` — the app (source of truth)
- `app/` — the same UI packaged for static CDNs, generated from `public/`
- `src/` / `cf-worker/` — the Wisp backend

Licensed under the GNU AGPL. Built on
[Scramjet](https://github.com/MercuryWorkshop/scramjet).
