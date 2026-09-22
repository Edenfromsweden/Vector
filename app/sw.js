// Service worker for the static shell. Imports the engine from this directory
// (vendored under app/cdn/ with neutral names) and routes proxied requests
// through it. The import path must match the copy map in build-svg-shell.mjs.
//
// The engine load is guarded: if it ever fails (e.g. a stale cached copy of
// THIS worker pointing at engine files that a later release moved), we must not
// let that brick the whole site. Falling through to the network keeps the shell
// loading, which lets the page register the current worker and self-heal --
// instead of a blank page that only a manual "clear site data" recovers.
let scramjet = null;
try {
	importScripts("cdn/core/core.js");
	scramjet = new ($scramjetLoadWorker().ScramjetServiceWorker)();
} catch (err) {
	// engine unavailable -> pass every request straight to the network
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
	event.waitUntil(self.clients.claim())
);

async function handleRequest(event) {
	if (scramjet) {
		await scramjet.loadConfig();
		if (scramjet.route(event)) {
			return scramjet.fetch(event);
		}
	}
	return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
	event.respondWith(handleRequest(event));
});
