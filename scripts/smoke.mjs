// Headless render check for both frontends.
//
// The bug that motivated this was invisible to every other kind of test: in an
// SVG document document.createElement builds nodes in the wrong namespace, so
// the UI attaches to the DOM, throws nothing, and renders at zero size. Only a
// real browser measuring real layout catches it. Run: npm run smoke
//
// Asserts, for each build: the games grid fills with cards that have non-zero
// size, and submitting a URL produces an XHTML iframe with non-zero size.
// No network needed -- the proxied page will not load here, but the shell's
// DOM work all happens before that.

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const TYPES = {
	".svg": "image/svg+xml",
	".js": "text/javascript",
	".mjs": "text/javascript",
	".cjs": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".wasm": "application/wasm",
	".woff2": "font/woff2",
	".html": "text/html",
};

// Serves a build the way its host does: `bases` are tried in order, so the
// public/ build picks up the vendored engine at /scram/ the way dist/ does.
function serve(bases, prefix = "") {
	return createServer((req, res) => {
		let url = decodeURIComponent(req.url.split("?")[0]);
		if (prefix && !url.startsWith(prefix)) {
			res.writeHead(404);
			return res.end("outside prefix");
		}
		url = url.slice(prefix.length) || "/";
		if (url === "/") url = "/index.html";
		for (const base of bases) {
			const file = join(root, base, url);
			if (existsSync(file) && statSync(file).isFile()) {
				res.writeHead(200, {
					"Content-Type": TYPES[extname(file)] || "application/octet-stream",
				});
				return res.end(readFileSync(file));
			}
		}
		res.writeHead(404);
		res.end("not found");
	});
}

async function check(page, label) {
	const r = await page.evaluate(async () => {
		// The SVG build roots its UI inside <foreignObject>; the HTML build does not.
		const fo = document.querySelector("foreignObject");
		const root = fo ? fo.firstElementChild : document;
		const q = (id) => root.querySelector(`[id="${id}"]`);
		const box = (el) => {
			const b = el.getBoundingClientRect();
			return { w: Math.round(b.width), h: Math.round(b.height) };
		};

		// Landing state first, before any panel is opened over it. An element can
		// carry [hidden] and still paint -- an inline display beats the UA rule --
		// so measure what is actually on screen rather than trusting attributes.
		const warn = q("boot-warn");
		const hero = root.querySelector(".wordmark");
		const landing = {
			banner: warn ? box(warn) : null,
			hero: hero ? box(hero) : null,
			// In the SVG build the aurora canvas sits at z-index:-1 and the body
			// must not paint a background over it (see the :root rule in
			// build-svg-shell.mjs). A body background here means a flat page with
			// no aurora, which renders fine and looks merely "wrong".
			svgShell: !!fo,
			bodyPaintsBackground: (() => {
				const body = root.querySelector("body") || document.body;
				if (!body) return null;
				const cs = getComputedStyle(body);
				return cs.backgroundImage !== "none";
			})(),
			topCentre: (() => {
				const el = document.elementFromPoint(
					Math.round(window.innerWidth / 2),
					Math.round(window.innerHeight / 2)
				);
				return el ? el.id || el.className || el.tagName : "none";
			})(),
		};

		q("open-games").dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true })
		);
		await new Promise((r) => setTimeout(r, 800));
		const card = q("games-grid").children[0];

		q("sj-address").value = "example.com";
		q("sj-form").dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true })
		);
		await new Promise((r) => setTimeout(r, 3000));
		const frame = q("vframes").firstElementChild;

		return {
			...landing,
			cards: q("games-grid").children.length,
			card: card ? box(card) : null,
			frame: frame ? { ns: frame.namespaceURI, ...box(frame) } : null,
			error: q("sj-error").textContent || "",
		};
	});

	const fail = [];

	// The shell must actually be on screen. The boot banner is a full-viewport
	// overlay that scripts retract; if it still paints, it hides the whole app.
	if (r.banner && (r.banner.w || r.banner.h))
		fail.push(
			`boot banner is still visible (${r.banner.w}x${r.banner.h}) -- it covers the page`
		);
	if (!r.hero || !r.hero.w || !r.hero.h)
		fail.push(`landing wordmark is not rendered: ${JSON.stringify(r.hero)}`);
	if (r.topCentre === "boot-warn")
		fail.push("boot banner is the topmost element at the centre of the page");
	if (r.svgShell && r.bodyPaintsBackground)
		fail.push(
			"body paints a background in the SVG shell -- it covers the " +
				"z-index:-1 aurora canvas, so the page renders without it"
		);

	if (!r.cards) fail.push("games grid is empty");
	if (!r.card || !r.card.w || !r.card.h)
		fail.push(`game card has no size: ${JSON.stringify(r.card)}`);
	if (!r.frame) fail.push("submitting a URL created no frame");
	else {
		if (!r.frame.w || !r.frame.h)
			fail.push(
				`frame has no size (${r.frame.w}x${r.frame.h}) -- in the DOM but ` +
					`rendering nothing, the classic wrong-namespace failure`
			);
		if (r.frame.ns !== "http://www.w3.org/1999/xhtml")
			fail.push(`frame is in the wrong namespace: ${r.frame.ns}`);
	}
	if (r.error) fail.push(`page reported: ${r.error}`);

	const size = r.frame ? `${r.frame.w}x${r.frame.h}` : "none";
	if (fail.length) {
		console.log(`FAIL  ${label}`);
		for (const f of fail) console.log(`        ${f}`);
		return false;
	}
	console.log(
		`ok    ${label}  (${r.cards} cards, frame ${size}, shell visible)`
	);
	return true;
}

async function main() {
	// Either package works; playwright pulls in playwright-core anyway.
	let chromium;
	for (const pkg of ["playwright-core", "playwright"]) {
		try {
			({ chromium } = await import(pkg));
			break;
		} catch {
			/* try the next one */
		}
	}
	if (!chromium) {
		console.log("SKIP: no playwright package installed.");
		console.log("      npm install --no-save playwright");
		process.exit(0);
	}

	// app/ is served off a CDN under a deep versioned path; reproduce that shape
	// so relative engine URLs and the service-worker scope are exercised for real.
	const CDN_PREFIX = "/gh/owner/repo@main";
	const appSrv = serve(["."], CDN_PREFIX).listen(8801);
	const pubSrv = serve(["public", "cdn"]).listen(8802);

	let browser;
	try {
		browser = await chromium.launch({
			executablePath: process.env.CHROMIUM_PATH || undefined,
			args: ["--no-sandbox"],
		});
	} catch (err) {
		console.log(
			`SKIP: could not launch Chromium (${err.message.split("\n")[0]})`
		);
		console.log(
			"      set CHROMIUM_PATH, or run: npx playwright install chromium"
		);
		appSrv.close();
		pubSrv.close();
		process.exit(0);
	}

	const cases = [
		[
			"app/index.svg (CDN shell)",
			`http://localhost:8801${CDN_PREFIX}/app/index.svg`,
			false,
		],
		[
			"app/index.svg, dom-shim.js blocked",
			`http://localhost:8801${CDN_PREFIX}/app/index.svg`,
			true,
		],
		["public/index.html (Worker build)", "http://localhost:8802/", false],
	];

	let ok = true;
	for (const [label, url, blockShim] of cases) {
		const ctx = await browser.newContext();
		const page = await ctx.newPage();
		const errors = [];
		page.on("pageerror", (e) => errors.push(e.message));
		if (blockShim) await page.route("**/dom-shim.js", (r) => r.abort());

		await page.goto(url, { waitUntil: "load" });
		await page.waitForTimeout(1500);
		if (!(await check(page, label))) ok = false;
		if (errors.length) {
			console.log(`        page errors: ${errors.join("; ")}`);
			ok = false;
		}
		await ctx.close();
	}

	await browser.close();
	appSrv.close();
	pubSrv.close();

	console.log(ok ? "\nAll render checks passed." : "\nRender checks FAILED.");
	process.exit(ok ? 0 : 1);
}

main();
