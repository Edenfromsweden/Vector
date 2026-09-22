# app/ — CDN shell (generated)

This directory is the same UI as `public/`, packaged as a single SVG document so
it can be served straight off a static CDN that will not serve HTML.

**Most of it is generated. Do not hand-edit these files:**

`index.svg`, `index.css`, `favicon.svg`, `search.js`, `wisp-config.js`,
`register-sw.js`, `games.js`, `bg.js`, `credits.html`, `fonts/`

Edit the originals in `public/` and regenerate:

```
npm run build:svg
```

The copied files are byte-identical to their `public/` counterparts, so
`diff public/games.js app/games.js` should always be empty. `index.svg` is
`public/index.html` converted to XHTML (numeric entities, quoted boolean
attributes, explicit namespace on nested `<svg>`) and wrapped in
`<svg><foreignObject>`.

Hand-maintained, because they genuinely differ per host:

- `app.js` — resolves the engine relative to the document and sets a Scramjet
  route prefix inside the service-worker scope. `public/index.js` does neither.
- `sw.js` — imports the engine from this directory rather than an absolute URL.
- `dom-shim.js` — only needed in an SVG document, where `document.createElement`
  would otherwise build nodes in the wrong namespace.
- `games.json` — points at wherever the game files are hosted.

## Note on parity

This `app/` folder is what the deployed `vector` Worker serves (assets-only, via
the repo-root `wrangler.jsonc`). It sets no response headers, so it is **not**
cross-origin isolated — anything depending on `SharedArrayBuffer` behaves
differently than under `npm start`, whose dev server sends
`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`. Scramjet proxying
does not need isolation, so this is fine in practice.
