"use strict";

/* The page is an SVG document (index.svg), so `document` is an XML document and
 * `document.createElement` builds elements in the SVG/null namespace. Those
 * elements attach fine and throw nothing, but they get no HTML layout: an
 * iframe comes out 0x0 and the game cards render as empty stubs. That is the
 * classic "I click Games / type a URL and nothing happens, with no error".
 *
 * This file does two jobs:
 *   1. exposes `window.xel(tag)`, which every script here uses instead of
 *      document.createElement, so our own code never depends on the patch below;
 *   2. patches `document` so third-party code (Scramjet, bare-mux) that calls
 *      document.createElement / getElementById internally also behaves.
 *
 * It is a separate file rather than an inline <script> on purpose: a page-level
 * Content-Security-Policy blocks inline script first, and losing this patch
 * silently breaks the entire UI.
 */

var XHTML = "http://www.w3.org/1999/xhtml";

window.xel = function (tag) {
	return document.createElementNS(XHTML, tag);
};

(function () {
	var fo = document.querySelector("foreignObject");
	var root = fo && fo.firstElementChild;
	if (!root) return;

	window.__vectorRoot = root;

	var cE = document.createElement.bind(document);
	var cENS = document.createElementNS.bind(document);

	Object.defineProperty(document, "head", {
		get: function () {
			return root.querySelector("head");
		},
		configurable: true,
	});
	Object.defineProperty(document, "body", {
		get: function () {
			return root.querySelector("body");
		},
		configurable: true,
	});
	Object.defineProperty(document, "documentElement", {
		get: function () {
			return root;
		},
		configurable: true,
	});

	document.createElement = function (t, o) {
		return typeof t === "string" ? cENS(XHTML, t, o) : cE(t, o);
	};
	document.createElementNS = function (ns, n, o) {
		return ns == null || ns === XHTML ? cENS(XHTML, n, o) : cENS(ns, n, o);
	};

	Object.defineProperty(document, "getElementById", {
		value: function (id) {
			return root.querySelector(
				'[id="' + String(id).replace(/["\\]/g, "\\$&") + '"]'
			);
		},
		configurable: true,
		writable: true,
	});

	var qs = document.querySelector.bind(document),
		qsa = document.querySelectorAll.bind(document);
	document.querySelector = function (s) {
		try {
			return root.querySelector(s) || qs(s);
		} catch (e) {
			return qs(s);
		}
	};
	document.querySelectorAll = function (s) {
		try {
			var a = root.querySelectorAll(s);
			return a.length ? a : qsa(s);
		} catch (e) {
			return qsa(s);
		}
	};
	document.getElementsByTagName = function (t) {
		return root.getElementsByTagNameNS(XHTML, t);
	};
	document.getElementsByClassName = function (c) {
		return root.getElementsByClassName(c);
	};

	if (navigator.userAgent.indexOf("Firefox") !== -1) {
		try {
			Object.defineProperty(globalThis, "crossOriginIsolated", {
				value: true,
				writable: false,
			});
		} catch (e) {}
	}
})();

/* Turn a silent failure into a visible one. Without this, any exception in
 * app.js / games.js leaves the page looking normal but completely inert. */
(function () {
	function find(id) {
		var root = window.__vectorRoot;
		return root ? root.querySelector('[id="' + id + '"]') : null;
	}

	// Scripts are running, so retract the no-JS banner baked into the markup.
	function hideBanner() {
		var b = find("boot-warn");
		if (b) b.setAttribute("hidden", "hidden");
	}
	hideBanner();
	document.addEventListener("DOMContentLoaded", hideBanner);

	window.addEventListener("error", function (e) {
		try {
			var msg = find("sj-error"),
				code = find("sj-error-code");
			if (msg && !msg.textContent)
				msg.textContent = "Vector hit an error while loading.";
			if (code && !code.textContent) {
				var where = e.filename
					? " (" + String(e.filename).split("/").pop() + ":" + e.lineno + ")"
					: "";
				code.textContent = (e.message || "script error") + where;
			}
		} catch (_) {}
	});
})();
