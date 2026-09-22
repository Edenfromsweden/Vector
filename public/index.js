"use strict";

/* ---- landing page elements ---- */
const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const searchEngine = document.getElementById("sj-search-engine");
const errorEl = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");

/* ---- browser-shell elements ---- */
const bar = document.getElementById("vbar");
const framesEl = document.getElementById("vframes");
const tabsEl = document.getElementById("vtabs");
const urlForm = document.getElementById("vurlform");
const urlInput = document.getElementById("vurl");
const btnBack = document.getElementById("vback");
const btnFwd = document.getElementById("vfwd");
const btnReload = document.getElementById("vreload");
const btnNew = document.getElementById("vnewtab");

const { ScramjetController } = $scramjetLoadController();

const scramjet = new ScramjetController({
	files: {
		wasm: "/scram/scramjet.wasm.wasm",
		all: "/scram/scramjet.all.js",
		sync: "/scram/scramjet.sync.js",
	},
	// Sites like Discord register their own service worker inside the frame;
	// this enables Scramjet's nested-service-worker support.
	flags: {
		serviceworkers: true,
	},
	// Obfuscate the proxied URL. The default codec is encodeURIComponent, which
	// leaves the target host readable in the path (/scram/https://discord.com/…),
	// so a URL-filtering extension matches it and shows its block page. base64url
	// makes the path an opaque blob with no hostname in it. These functions are
	// serialized and re-run inside the service worker, so they must be
	// self-contained (no references to anything outside).
	codec: {
		encode: (str) => {
			if (!str) return str;
			return btoa(encodeURIComponent(str))
				.replace(/=/g, "")
				.replace(/\+/g, "-")
				.replace(/\//g, "_");
		},
		decode: (str) => {
			if (!str) return str;
			str = str.replace(/-/g, "+").replace(/_/g, "/");
			while (str.length % 4) str += "=";
			return decodeURIComponent(atob(str));
		},
	},
});

scramjet.init();

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

/* Register the service worker + wisp transport once, before the first frame. */
let transportReady = false;
async function ensureTransport() {
	await registerSW();
	if (transportReady) return;
	const wispUrl =
		window.WISP_URL ||
		(location.protocol === "https:" ? "wss" : "ws") +
			"://" +
			location.host +
			"/wisp/";
	if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
		await connection.setTransport("/libcurl/index.mjs", [
			{ websocket: wispUrl },
		]);
	}
	transportReady = true;
}

/* ---- tabs ---- */
const tabs = [];
let active = null;

function setChrome(on) {
	bar.classList.toggle("show", on);
	framesEl.classList.toggle("show", on);
	document.body.classList.toggle("proxying", on);
	bar.setAttribute("aria-hidden", on ? "false" : "true");
	framesEl.setAttribute("aria-hidden", on ? "false" : "true");
}

function labelFor(url) {
	if (!url) return "New Tab";
	try {
		return new URL(url).hostname.replace(/^www\./, "") || url;
	} catch {
		return url;
	}
}

function renderTabs() {
	tabsEl.textContent = "";
	for (const tab of tabs) {
		const btn = document.createElement("button");
		btn.className = "vtab" + (tab === active ? " active" : "");
		btn.title = tab.url || "New Tab";

		const label = document.createElement("span");
		label.className = "vtab-label";
		label.textContent = labelFor(tab.url);

		const close = document.createElement("span");
		close.className = "vtab-close";
		close.textContent = "×";
		close.setAttribute("role", "button");
		close.title = "Close tab";
		close.addEventListener("click", (e) => {
			e.stopPropagation();
			closeTab(tab);
		});

		btn.append(label, close);
		btn.addEventListener("click", () => activateTab(tab));
		tabsEl.appendChild(btn);
	}
}

function activateTab(tab) {
	active = tab;
	for (const t of tabs) t.sframe.frame.classList.toggle("active", t === tab);
	urlInput.value = tab.url || "";
	renderTabs();
	if (!tab.url) urlInput.focus();
}

function openTab(url) {
	const iframe = document.createElement("iframe");
	iframe.className = "vframe";
	iframe.setAttribute("allow", "fullscreen; clipboard-read; clipboard-write");

	const sframe = scramjet.createFrame(iframe);
	framesEl.appendChild(iframe);

	const tab = { sframe, url: url || "" };
	sframe.addEventListener("urlchange", (e) => {
		if (!e.url) return;
		tab.url = e.url;
		if (tab === active) urlInput.value = e.url;
		renderTabs();
	});

	tabs.push(tab);
	setChrome(true);
	activateTab(tab);
	if (url) sframe.go(url);
	return tab;
}

function closeTab(tab) {
	const i = tabs.indexOf(tab);
	if (i === -1) return;
	tab.sframe.frame.remove();
	tabs.splice(i, 1);

	if (active === tab) {
		const next = tabs[i] || tabs[i - 1] || null;
		if (next) {
			activateTab(next);
		} else {
			active = null;
			setChrome(false); // no tabs left -> back to the Vector landing page
			renderTabs();
		}
	} else {
		renderTabs();
	}
}

/* Navigate the active tab (or open the first one). Input may be a URL or a search. */
function navigate(input) {
	const value = (input || "").trim();
	if (!value) return;
	const url = search(value, searchEngine.value);
	if (!active) {
		openTab(url);
	} else {
		active.url = url;
		urlInput.value = url;
		active.sframe.go(url);
	}
}

/* ---- events ---- */

// Landing search box
form.addEventListener("submit", async (e) => {
	e.preventDefault();
	errorEl.textContent = "";
	errorCode.textContent = "";
	try {
		await ensureTransport();
	} catch (err) {
		errorEl.textContent = "Couldn't start the proxy.";
		errorCode.textContent = err.toString();
		return;
	}
	navigate(address.value);
});

// Address bar inside the shell
urlForm.addEventListener("submit", async (e) => {
	e.preventDefault();
	try {
		await ensureTransport();
	} catch (err) {
		return;
	}
	navigate(urlInput.value);
	urlInput.blur();
});

// New tab
btnNew.addEventListener("click", async () => {
	try {
		await ensureTransport();
	} catch (err) {
		return;
	}
	openTab(); // blank tab: focuses the address bar
});

btnBack.addEventListener("click", () => active && active.sframe.back());
btnFwd.addEventListener("click", () => active && active.sframe.forward());
btnReload.addEventListener("click", () => active && active.sframe.reload());
