"use strict";

/* Games section: reads games.json, renders a grid, plays games in an overlay,
 * lets you download a game's HTML, and stores favorites in a cookie.
 *
 * The player iframe (#gv-frame) is `credentialless`, which is what lets it be
 * embedded in the cross-origin-isolated shell and still load a game that pulls
 * third-party assets. A plain iframe is blocked here (COEP). */
(function () {
	const xel =
		window.xel ||
		((t) => document.createElementNS("http://www.w3.org/1999/xhtml", t));

	const grid = document.getElementById("games-grid");
	const empty = document.getElementById("games-empty");
	const panel = document.getElementById("games");
	const openBtn = document.getElementById("open-games");
	const closeBtn = document.getElementById("games-close");

	const view = document.getElementById("game-view");
	const frame = document.getElementById("gv-frame");
	const vTitle = document.getElementById("gv-title");
	const vBack = document.getElementById("gv-back");
	const vFav = document.getElementById("gv-fav");
	const vDl = document.getElementById("gv-dl");

	if (!grid) return;

	const FAV = "vector_favs";
	const STAR = "★"; // ★
	const STAR_O = "☆"; // ☆

	function getFavs() {
		const m = document.cookie.match(/(?:^|;\s*)vector_favs=([^;]*)/);
		if (!m) return [];
		try {
			return JSON.parse(decodeURIComponent(m[1])) || [];
		} catch {
			return [];
		}
	}
	function saveFavs(list) {
		const val = encodeURIComponent(JSON.stringify(list));
		const exp = new Date(Date.now() + 365 * 864e5).toUTCString();
		document.cookie = `${FAV}=${val}; expires=${exp}; path=/; SameSite=Lax`;
	}
	function isFav(id) {
		return getFavs().includes(id);
	}
	function toggleFav(id) {
		const f = getFavs();
		const i = f.indexOf(id);
		if (i >= 0) f.splice(i, 1);
		else f.push(id);
		saveFavs(f);
		return f.includes(id);
	}

	let games = [];

	// Source filter + text search over the grid. "All" shows everything; the
	// other values match a game's `source` tag (Local / Lumin).
	let currentSource = "All";
	let currentSearch = "";
	const searchEl = document.getElementById("games-search");
	const filtersEl = document.getElementById("games-filters");

	function fileName(path) {
		return path.split("/").pop();
	}

	function visibleGames() {
		const q = currentSearch.trim().toLowerCase();
		return games.filter(
			(g) =>
				(currentSource === "All" || g.source === currentSource) &&
				(!q || g.name.toLowerCase().includes(q))
		);
	}

	function render() {
		const favs = getFavs();
		const sorted = visibleGames().sort((a, b) => {
			const fa = favs.includes(a.id),
				fb = favs.includes(b.id);
			if (fa !== fb) return fa ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		grid.textContent = "";
		if (!sorted.length) {
			if (empty) empty.hidden = false;
			return;
		}
		if (empty) empty.hidden = true;

		for (const g of sorted) {
			const card = xel("div");
			card.className = "game-card";

			const play = xel("button");
			play.className = "game-play";
			play.title = "Play " + g.name;

			const cover = xel("span");
			cover.className = "game-cover";
			if (g.icon) {
				const img = xel("img");
				img.className = "game-cover-img";
				img.loading = "lazy";
				img.alt = "";
				img.referrerPolicy = "no-referrer";
				img.src = g.icon;
				img.addEventListener("error", () => {
					cover.classList.add("noimg");
					img.remove();
				});
				cover.appendChild(img);
			} else {
				cover.classList.add("noimg");
			}

			const nameEl = xel("span");
			nameEl.className = "game-name";
			nameEl.textContent = g.name;

			play.append(cover, nameEl);
			play.addEventListener("click", () => openGame(g));

			const actions = xel("div");
			actions.className = "game-actions";

			const fav = xel("button");
			fav.className = "game-fav" + (isFav(g.id) ? " on" : "");
			fav.textContent = isFav(g.id) ? STAR : STAR_O;
			fav.title = "Favorite";
			fav.setAttribute("aria-pressed", isFav(g.id) ? "true" : "false");
			fav.addEventListener("click", (e) => {
				e.stopPropagation();
				toggleFav(g.id);
				render();
			});

			const dl = xel("a");
			dl.className = "game-dl";
			dl.textContent = "⤓"; // ⤓
			dl.title = "Download HTML";
			dl.href = g.file;
			dl.download = fileName(g.file);

			actions.append(fav, dl);
			card.append(play, actions);
			grid.appendChild(card);
		}
	}

	function openGame(g) {
		if (!view) return;
		frame.src = g.file;
		vTitle.textContent = g.name;
		vDl.href = g.file;
		vDl.download = fileName(g.file);
		syncViewFav(g);
		vFav.onclick = () => {
			toggleFav(g.id);
			syncViewFav(g);
			render();
		};
		view.classList.add("show");
		view.setAttribute("aria-hidden", "false");
	}
	function syncViewFav(g) {
		const on = isFav(g.id);
		vFav.textContent = on ? STAR : STAR_O;
		vFav.classList.toggle("on", on);
		vFav.setAttribute("aria-pressed", on ? "true" : "false");
	}
	function closeGame() {
		if (!view) return;
		view.classList.remove("show");
		view.setAttribute("aria-hidden", "true");
		frame.src = "about:blank";
	}

	if (openBtn)
		openBtn.addEventListener("click", (e) => {
			e.preventDefault();
			panel.classList.add("show");
			panel.setAttribute("aria-hidden", "false");
		});
	if (closeBtn)
		closeBtn.addEventListener("click", () => {
			panel.classList.remove("show");
			panel.setAttribute("aria-hidden", "true");
		});
	if (vBack) vBack.addEventListener("click", closeGame);

	if (searchEl)
		searchEl.addEventListener("input", () => {
			currentSearch = searchEl.value;
			render();
		});
	if (filtersEl)
		filtersEl.addEventListener("click", (e) => {
			const btn = e.target.closest(".game-filter");
			if (!btn) return;
			currentSource = btn.dataset.source || "All";
			for (const b of filtersEl.querySelectorAll(".game-filter"))
				b.classList.toggle("on", b === btn);
			render();
		});

	/* Extra game collections, fetched from third-party CDNs at runtime and merged
	 * into the same grid as the local games. Each source is normalized to the
	 * {id, name, file, icon} shape the grid already uses, so they render and play
	 * through the existing card + credentialless-iframe player. A source that
	 * fails or times out is skipped; the local games always render first. */
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
		html: "https://cdn.jsdelivr.net/gh/daknux/html@main",
	};
	async function fetchJSON(url) {
		try {
			const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
			return r.ok ? await r.json() : [];
		} catch {
			return [];
		}
	}

	// Daknux manifest shape: {url, title/name, cover}. `idPrefix` keeps ids
	// unique per repo; `source` is the filter label shown.
	function normZones(data, c, idPrefix, source) {
		return (Array.isArray(data) ? data : []).map((g) => {
			const u = clean(g.url);
			const file = u.includes(".")
				? `${c.html}/${u}`
				: `${c.html}/${u}/index.html`;
			const name = g.title || g.name || u;
			return {
				id: `${idPrefix}:${name}`,
				name,
				file,
				icon: g.cover ? `${c.cover}/${clean(g.cover)}` : null,
				source,
			};
		});
	}


	// Only the Lumin collection (Daknux) is loaded alongside the local games.
	async function loadCollections() {
		const dk = await fetchJSON(DAKNUX.api);
		return [...normZones(dk, DAKNUX, "Daknux", "Lumin")].filter(
			(g) => g.file && g.name && !isJunk(g.name, g.file)
		);
	}

	// Manifests carry a few non-game promo rows ("[!] COMMENTS", "[!] MORE FUN
	// AT .gg/…") that link to Discord instead of a game. Drop them.
	function isJunk(name, url) {
		return /^\s*\[!\]/.test(name || "") || /discord\.gg/i.test(url || "");
	}

	async function loadAll() {
		try {
			const r = await fetch("games.json", { cache: "no-store" });
			const list = r.ok ? await r.json() : [];
			games = (Array.isArray(list) ? list : []).map((g) => ({
				...g,
				source: "Local",
			}));
		} catch {
			games = [];
		}
		render(); // local games show immediately

		try {
			const extra = await loadCollections();
			const seen = new Set(games.map((g) => g.id));
			for (const g of extra) {
				if (!seen.has(g.id)) {
					seen.add(g.id);
					games.push(g);
				}
			}
			render(); // re-render with the collections merged in
		} catch {
			/* keep whatever local games rendered */
		}
	}

	loadAll();
})();
