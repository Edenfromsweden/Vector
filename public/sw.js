// The engine load is guarded so a failure here can't brick the site: if it
// throws, fall through to the network so the shell still loads and can register
// a fresh worker, instead of leaving a blank page only "clear site data" fixes.
let engine = null;
try {
	importScripts("/scram/scramjet.all.js");
	engine = new ($scramjetLoadWorker().ScramjetServiceWorker)();
} catch (err) {
	// unavailable -> pass every request straight to the network
}

// Take over immediately instead of waiting for every tab to close, so the
// first navigation after a deploy is actually intercepted.
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
