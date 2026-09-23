"use strict";

/* Loading screen shown on open. Preloads EVERY game icon — the local games plus
 * the Lumin collection (UGS + Daknux) — with a live
 * progress bar and the name of whatever just finished, then fades out.
 *
 * It is defensive on purpose: icons load through a bounded pool (so we don't
 * fire thousands of requests at once), each icon has its own timeout and any
 * failure still counts as progress, there's a Skip button, and an overall
 * ceiling dismisses the screen no matter what — a slow or filtered network can
 * never leave the site stuck behind it.
 *
 * The collection icon URLs mirror the resolution in games.js; keep them in sync. */
(function () {
	const pre = document.getElementById("preloader");
	if (!pre) return;

	const fill = document.getElementById("pl-fill");
	const status = document.getElementById("pl-status");
	const skip = document.getElementById("pl-skip");

	const CONCURRENCY = 16;
	const IMG_TIMEOUT = 8000; // a stuck request counts as done after this
	const CEILING = 6 * 60 * 1000; // absolute cap on the whole screen

	let cancelled = false;
	let finished = false;
	function done() {
		if (finished) return;
		finished = true;
		cancelled = true;
		pre.classList.add("done");
		setTimeout(() => {
			pre.style.display = "none";
		}, 450);
	}

	const ceiling = setTimeout(done, CEILING);
	if (skip) skip.addEventListener("click", done);

	function setStatus(text) {
		if (status) status.textContent = text;
	}
	function setPct(p) {
		if (fill) fill.style.width = Math.round(p) + "%";
	}

	// --- collection icon resolution (mirror of games.js) ---------------------
	const clean = (p) =>
		!p
			? ""
			: p
					.replace(/%7BHTML_URL%7D\//gi, "")
					.replace(/\{HTML_URL\}\//gi, "")
					.replace(/%7BCOVER_URL%7D\//gi, "")
					.replace(/\{COVER_URL\}\//gi, "")
					.replace(/^\//, "");

	const DAKNUX = {
		api: "https://cdn.jsdelivr.net/gh/daknux/assets@latest/zones.json",
		cover: "https://cdn.jsdelivr.net/gh/daknux/covers@main",
	};
	const UGS = {
		api: "https://cdn.jsdelivr.net/gh/Sea-Math/ugs-json@main/games.json",
		h1: "https://cdn.jsdelivr.net/gh/Sea-Math/ugs-1@main",
	};

	async function fetchJSON(url) {
		try {
			const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
			return r.ok ? await r.json() : [];
		} catch {
			return [];
		}
	}

	function zonesIcons(data, cover) {
		return (Array.isArray(data) ? data : [])
			.filter((g) => g && g.cover)
			.map((g) => ({
				name: g.title || g.name || "",
				icon: `${cover}/${clean(g.cover)}`,
			}));
	}
	function ugsIcons(data) {
		return (Array.isArray(data) ? data : [])
			.map((g) => {
				let cover = (g.cover || g.image || "").replace(
					/\{COVER_URL\}/g,
					UGS.h1.replace("/ugs-1@main", "/ugs-covers@main")
				);
				if (cover && !cover.startsWith("http")) cover = `${UGS.h1}/${clean(cover)}`;
				return { name: g.title || g.name || "", icon: cover };
			})
			.filter((g) => g.icon);
	}
	// --- image pool ----------------------------------------------------------
	function preloadOne(url) {
		return new Promise((resolve) => {
			const img = new Image();
			let settled = false;
			const finish = () => {
				if (settled) return;
				settled = true;
				resolve();
			};
			const t = setTimeout(finish, IMG_TIMEOUT);
			img.referrerPolicy = "no-referrer";
			img.onload = () => {
				clearTimeout(t);
				finish();
			};
			img.onerror = () => {
				clearTimeout(t);
				finish();
			};
			img.src = url;
		});
	}

	async function runPool(items) {
		const total = items.length;
		if (!total) {
			setPct(100);
			done();
			return;
		}
		let loaded = 0;
		let next = 0;
		async function worker() {
			while (next < items.length && !cancelled) {
				const g = items[next++];
				await preloadOne(g.icon);
				loaded++;
				setPct((loaded / total) * 100);
				setStatus(
					`Loading ${loaded} / ${total}` + (g.name ? ` — ${g.name}` : "")
				);
			}
		}
		const workers = [];
		for (let k = 0; k < Math.min(CONCURRENCY, total); k++) workers.push(worker());
		await Promise.all(workers);
		if (!cancelled) {
			clearTimeout(ceiling);
			setStatus(`Loaded ${total} icons`);
			setTimeout(done, 200);
		}
	}

	// --- gather everything, then run ----------------------------------------
	(async function () {
		setStatus("Fetching game lists…");
		const [local, dk, ug] = await Promise.all([
			fetchJSON("games.json"),
			fetchJSON(DAKNUX.api),
			fetchJSON(UGS.api),
		]);
		if (cancelled) return;

		const localIcons = (Array.isArray(local) ? local : [])
			.filter((g) => g && g.icon)
			.map((g) => ({ name: g.name || "", icon: g.icon }));

		const all = [...localIcons, ...zonesIcons(dk, DAKNUX.cover), ...ugsIcons(ug)];

		// Dedupe identical icon URLs so shared covers only load once.
		const seen = new Set();
		const items = [];
		for (const g of all) {
			if (g.icon && !seen.has(g.icon) && !/^\s*\[!\]/.test(g.name || "")) {
				seen.add(g.icon);
				items.push(g);
			}
		}

		await runPool(items);
	})().catch(() => {
		clearTimeout(ceiling);
		done();
	});
})();
