"use strict";

/* Proxy + tab-bar logic for the jsDelivr-hosted SVG shell.
 * The page is on cdn.jsdelivr.net, so engine / bare-mux worker / libcurl /
 * sw.js are all same-origin under the repo path. The Scramjet route prefix is
 * computed to sit INSIDE the service-worker scope (this directory). */

const here = new URL("./", location.href); // .../<repo>@main/app/
const prefix = new URL("./service/", here).pathname; // under the SW scope
const engineURL = (p) => new URL("../cdn/" + p, here).href;

const xel =
	window.xel ||
	((t) => document.createElementNS("http://www.w3.org/1999/xhtml", t));

// document.body is undefined in an SVG document unless dom-shim.js patched it;
// resolve it directly so a missing shim degrades instead of throwing.
const bodyEl =
	document.body ||
	(window.__vectorRoot && window.__vectorRoot.querySelector("body")) ||
	(document.querySelector("foreignObject") &&
		document
			.querySelector("foreignObject")
			.firstElementChild.querySelector("body"));

// The markup ships a "no JavaScript ran" banner. This file running at all
// disproves that, so retract it here too rather than only in dom-shim.js.
(function () {
	// The SVG shell roots the UI inside <foreignObject>; the HTML shell has no
	// such wrapper, so fall back to the document itself.
	const root =
		window.__vectorRoot ||
		(document.querySelector("foreignObject") || {}).firstElementChild ||
		document;
	const warn = root && root.querySelector('[id="boot-warn"]');
	if (!warn) return;
	// Inline display:flex on the banner outranks [hidden] { display: none },
	// so the attribute alone leaves it covering the whole page.
	warn.style.display = "none";
	warn.setAttribute("hidden", "hidden");
})();

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
	prefix,
	files: {
		wasm: engineURL("scram/scramjet.wasm.wasm"),
		all: engineURL("scram/scramjet.all.js"),
		sync: engineURL("scram/scramjet.sync.js"),
	},
	flags: { serviceworkers: true },
});

scramjet.init();

const connection = new BareMux.BareMuxConnection(
	engineURL("baremux/worker.js")
);
const transportPath = engineURL("libcurl/index.mjs");

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
	if ((await connection.getTransport()) !== transportPath) {
		await connection.setTransport(transportPath, [{ websocket: wispUrl }]);
	}
	transportReady = true;
}

/* ---- tabs ---- */
const tabs = [];
let active = null;

function setChrome(on) {
	bar.classList.toggle("show", on);
	framesEl.classList.toggle("show", on);
	if (bodyEl) bodyEl.classList.toggle("proxying", on);
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
		const btn = xel("button");
		btn.className = "vtab" + (tab === active ? " active" : "");
		btn.title = tab.url || "New Tab";

		const label = xel("span");
		label.className = "vtab-label";
		label.textContent = labelFor(tab.url);

		const close = xel("span");
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
	const iframe = xel("iframe");
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
			setChrome(false);
			renderTabs();
		}
	} else {
		renderTabs();
	}
}

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

btnNew.addEventListener("click", async () => {
	try {
		await ensureTransport();
	} catch (err) {
		return;
	}
	openTab();
});

btnBack.addEventListener("click", () => active && active.sframe.back());
btnFwd.addEventListener("click", () => active && active.sframe.forward());
btnReload.addEventListener("click", () => active && active.sframe.reload());
