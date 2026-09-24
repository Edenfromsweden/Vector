"use strict";
/* Picks which endpoint the app talks to. Default is the primary; add
 * ?backend=<name> to the URL (remembered) or call setBackend("<name>") in the
 * console to switch. Empty on localhost so it uses the local dev server. */
(function () {
	var BACKENDS = {
		worker: "wss://relay.zilkcz.com/",
		public: "wss://anura.pro/",
		mine: "wss://relay2.zilkcz.com/ws/",
	};
	var DEFAULT = "worker";

	var host = location.hostname;
	if (host === "localhost" || host === "127.0.0.1") {
		window.EP_URL = ""; // local dev server
		window.EP_MODE = "local";
	} else {
		var name = DEFAULT;
		try {
			var param = new URLSearchParams(location.search).get("backend");
			if (param && BACKENDS[param]) {
				localStorage.setItem("ep_mode", param);
				name = param;
			} else {
				var saved = localStorage.getItem("ep_mode");
				if (saved && BACKENDS[saved]) name = saved;
			}
		} catch (e) {
			/* storage blocked: use the default */
		}
		window.EP_URL = BACKENDS[name];
		window.EP_MODE = name;
	}

	window.setBackend = function (n) {
		if (!BACKENDS[n]) {
			console.warn("setBackend: use one of " + Object.keys(BACKENDS).join(", "));
			return;
		}
		try {
			localStorage.setItem("ep_mode", n);
		} catch (e) {
			/* ignore */
		}
		location.reload();
	};
})();
