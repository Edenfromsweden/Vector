"use strict";
/**
 * Wisp backend selection.
 *
 * The Wisp server is what actually opens the outbound connection, so it decides
 * which sites are reachable. Two options:
 *
 *  - "worker" (default): your Cloudflare Worker, wss://wisp.zilkcz.com/. It's on
 *    your own domain and fast, but a Cloudflare Worker cannot open a socket to a
 *    Cloudflare-hosted site, so Discord / X / example.com fail through it.
 *  - "public": a shared public Wisp server (anura.pro) that is NOT a Worker, so
 *    it CAN reach those sites -- enough to load Discord text/login. It is someone
 *    else's server: treat it as unreliable and slower, and don't sign in to
 *    anything you actually care about through it.
 *  - "mine": your OWN Wisp server on a real host (a DigitalOcean droplet), fronted
 *    by Cloudflare at wss://wisp2.zilkcz.com/wisp/. Reaches Discord like "public"
 *    does, but private, reliable, and yours. Set this up per DEPLOY.md -- until
 *    the droplet is running, ?backend=mine will just fail to connect. Note the
 *    "/wisp/" path: the repo's own server (src/index.js) serves Wisp there.
 *
 * Which one is chosen, highest priority first:
 *   1. ?backend=public  (or ?backend=worker) in the URL   -- also remembered
 *   2. localStorage "vector_backend"                      -- set by setBackend()
 *   3. default: worker
 *
 * Flip it live, no rebuild:
 *   - visit  https://v.zilkcz.com/?backend=public   (plain URLs then stay public)
 *   - or in the browser console:  setBackend("public")   // reloads
 *     switch back with  setBackend("worker")
 *
 * LOCAL DEV (`npm start`): on localhost the frontend + Wisp run together, so the
 * backend is same-origin (empty WISP_URL) no matter what is set above.
 */
(function () {
	var BACKENDS = {
		worker: "wss://wisp.zilkcz.com/",
		public: "wss://anura.pro/",
		mine: "wss://wisp2.zilkcz.com/wisp/",
	};
	var DEFAULT = "worker";

	var host = location.hostname;
	if (host === "localhost" || host === "127.0.0.1") {
		window.WISP_URL = ""; // same-origin dev server
		window.VECTOR_BACKEND = "local";
	} else {
		var name = DEFAULT;
		try {
			var param = new URLSearchParams(location.search).get("backend");
			if (param && BACKENDS[param]) {
				localStorage.setItem("vector_backend", param);
				name = param;
			} else {
				var saved = localStorage.getItem("vector_backend");
				if (saved && BACKENDS[saved]) name = saved;
			}
		} catch (e) {
			/* private mode / blocked storage: fall back to the default */
		}
		window.WISP_URL = BACKENDS[name];
		window.VECTOR_BACKEND = name;
	}

	window.setBackend = function (n) {
		if (!BACKENDS[n]) {
			console.warn("setBackend: use one of " + Object.keys(BACKENDS).join(", "));
			return;
		}
		try {
			localStorage.setItem("vector_backend", n);
		} catch (e) {
			/* ignore */
		}
		location.reload();
	};
})();
