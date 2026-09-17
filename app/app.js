"use strict";

/* Proxy logic for the jsDelivr-hosted SVG shell.
 * The page lives on cdn.jsdelivr.net, so everything (engine, bare-mux worker,
 * libcurl transport, sw.js) is same-origin under the repo path. The Scramjet
 * route prefix is computed to sit INSIDE the service-worker scope (this dir). */

const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const searchEngine = document.getElementById("sj-search-engine");
const errorEl = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");

const here = new URL("./", location.href); // .../<repo>@main/app/
// Route prefix must be under the SW scope (this directory).
const prefix = new URL("./service/", here).pathname;
// Engine files (same-origin on jsDelivr — CORP makes them load fine).
const scramFiles = {
	wasm: new URL("../cdn/scram/scramjet.wasm.wasm", here).href,
	all: new URL("../cdn/scram/scramjet.all.js", here).href,
	sync: new URL("../cdn/scram/scramjet.sync.js", here).href,
};

const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
	prefix,
	files: scramFiles,
	flags: { serviceworkers: true },
});
scramjet.init();

const connection = new BareMux.BareMuxConnection(
	new URL("../cdn/baremux/worker.js", here).href
);

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	errorEl.textContent = "";
	errorCode.textContent = "";
	try {
		await registerSW();
	} catch (err) {
		errorEl.textContent = "Couldn't start the proxy.";
		errorCode.textContent = err.toString();
		return;
	}

	const url = search(address.value, searchEngine.value);
	const wispUrl =
		window.WISP_URL ||
		(location.protocol === "https:" ? "wss" : "ws") +
			"://" +
			location.host +
			"/wisp/";
	const transport = new URL("../cdn/libcurl/index.mjs", here).href;
	if ((await connection.getTransport()) !== transport) {
		await connection.setTransport(transport, [{ websocket: wispUrl }]);
	}

	const frame = scramjet.createFrame();
	frame.frame.id = "sj-frame";
	document.body.appendChild(frame.frame);
	frame.go(url);
});
