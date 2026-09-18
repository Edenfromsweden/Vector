// Builds a static `dist/` folder for Cloudflare Pages (or any static host).
//
// The Fastify dev server (src/index.js) mounts the Scramjet / libcurl / bare-mux
// vendor assets from node_modules at runtime. A static host can't do that, so we
// copy them into dist/ alongside public/, and emit the COOP/COEP headers Scramjet
// needs (crossOriginIsolated -> SharedArrayBuffer/WASM threads).
import {
	readdirSync,
	rmSync,
	mkdirSync,
	cpSync,
	writeFileSync,
	readFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { scanGames } from "./gen-games.mjs";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = fileURLToPath(new URL("../dist", import.meta.url));
const publicDir = fileURLToPath(new URL("../public", import.meta.url));

console.log("Cleaning dist/ ...");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

console.log("Copying public/ -> dist/");
cpSync(publicDir, dist, { recursive: true });

// Cache-bust the app shell: stamp a per-build version onto the CSS/JS URLs so a
// redeploy is never shadowed by a browser's cached index.css / index.js.
const build = Date.now().toString(36);
let html = readFileSync(`${dist}/index.html`, "utf8");
for (const asset of [
	"index.css",
	"index.js",
	"wisp-config.js",
	"games.js",
	"search.js",
	"bg.js",
]) {
	html = html
		.replace(`href="${asset}"`, `href="${asset}?v=${build}"`)
		.replace(`src="${asset}"`, `src="${asset}?v=${build}"`);
}
writeFileSync(`${dist}/index.html`, html);
console.log(`Stamped app-shell assets with ?v=${build}`);

// Generate the games manifest from whatever .html files are in games/.
const games = scanGames(`${dist}/games`);
writeFileSync(`${dist}/games.json`, JSON.stringify(games, null, 2) + "\n");
console.log(`Wrote games.json (${games.length} game(s))`);

const vendor = [
  [scramjetPath, "scram"],
  [libcurlPath, "libcurl"],
  [baremuxPath, "baremux"],
];
for (const [src, name] of vendor) {
  console.log(`Copying ${name} vendor assets -> dist/${name}/`);
  cpSync(src, `${dist}/${name}`, { recursive: true });
}

// Cloudflare Pages Direct Upload rejects a folder that contains .ts files
// ("requires a build process"). The vendored engines ship .d.ts declarations,
// source maps, and a scram/types/ tree -- none of which the browser runs.
// Strip them so the build is a pure static bundle that Direct Upload accepts.
function pruneNonRuntime(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = `${dir}/${entry.name}`;
		if (entry.isDirectory()) {
			if (entry.name === "types") {
				rmSync(full, { recursive: true, force: true });
			} else {
				pruneNonRuntime(full);
			}
		} else if (/\.(ts|map)$/.test(entry.name)) {
			rmSync(full, { force: true });
		}
	}
}
pruneNonRuntime(dist);
console.log("Pruned .ts / .map / types from dist/ (Direct-Upload safe)");

// Cloudflare Pages _headers: cross-origin isolation on every route, and
// no-cache on the app shell so a redeploy is never shadowed by stale HTML/CSS/JS
// (the browser still gets fast 304s via ETag; big vendor bundles + font stay cached).
const headers = `/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp

/games/*
  Cross-Origin-Embedder-Policy: unsafe-none
  Cross-Origin-Opener-Policy: unsafe-none

/
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/index.css
  Cache-Control: no-cache

/index.js
  Cache-Control: no-cache

/wisp-config.js
  Cache-Control: no-cache
`;
writeFileSync(`${dist}/_headers`, headers);
console.log("Wrote dist/_headers (COOP/COEP)");

console.log("\nDone. Static site is in dist/.");
console.log("Set window.WISP_URL in public/wisp-config.js to your Worker BEFORE building for the split deploy.");
