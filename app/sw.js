// Loads the engine from this folder and hands requests to it. The load is
// guarded: if it fails (e.g. a stale cached copy pointing at files a later
// release moved), fall through to the network so the shell still loads and can
// register the current worker, instead of leaving a blank page.
let engine = null;
try {
	importScripts("cdn/core/core.js");
	engine = new ($scramjetLoadWorker().ScramjetServiceWorker)();
} catch (err) {
	// unavailable -> pass every request straight to the network
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
	event.waitUntil(self.clients.claim())
);

async function handleRequest(event) {
	if (engine) {
		await engine.loadConfig();
		if (engine.route(event)) {
			return engine.fetch(event);
		}
	}
	return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
	event.respondWith(handleRequest(event));
});
