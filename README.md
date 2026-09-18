<h1 align="center">Vector</h1>

<p align="center">A straight line to the open web.</p>

Vector is an educational web proxy — a self-hosted front end built on
[Scramjet](https://github.com/MercuryWorkshop/scramjet).

## Run it locally

```bash
npm install
npm start        # http://localhost:8080
```

Open it in real Chrome (not an embedded webview), type a URL, press Enter.

## Deploy it

```bash
npm run deploy:site
```

Deploys the front end to your Cloudflare Worker. Each hostname in
`vector-site/wrangler.toml` is a working link; add a line and redeploy for
another. Full guide in [`DEPLOY.md`](DEPLOY.md).

## Layout

- `public/` — the app (source of truth)
- `app/` — the same UI packaged for static CDNs, generated from `public/`
- `src/` / `cf-worker/` — the Wisp backend

Licensed under the GNU AGPL. Built on
[Scramjet](https://github.com/MercuryWorkshop/scramjet).
