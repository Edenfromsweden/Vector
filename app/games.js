"use strict";

/* Games section: loads the Lumin (Daknux) collection, renders a grid, plays
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
	let loading = true;

	// Render the grid a page at a time so ~400+ cards don't all build at once.
	const PAGE_SIZE = 60;
	let shown = PAGE_SIZE;

	// Text search over the grid, remembered across opens.
	const SEARCH_KEY = "vector_games_search";
	let currentSearch = "";
	const searchEl = document.getElementById("games-search");
	const randomBtn = document.getElementById("games-random");
	try {
		currentSearch = localStorage.getItem(SEARCH_KEY) || "";
		if (searchEl && currentSearch) searchEl.value = currentSearch;
	} catch {
		/* storage may be unavailable */
	}

	function fileName(path) {
		return path.split("/").pop();
	}

	function visibleGames() {
		const q = currentSearch.trim().toLowerCase();
		const favs = getFavs();
		return games
			.filter((g) => !q || g.name.toLowerCase().includes(q))
			.sort((a, b) => {
				const fa = favs.includes(a.id),
					fb = favs.includes(b.id);
				if (fa !== fb) return fa ? -1 : 1;
				return a.name.localeCompare(b.name);
			});
	}

	function render() {
		const sorted = visibleGames();

		grid.textContent = "";
		if (!sorted.length) {
			if (empty) {
				empty.hidden = false;
				empty.textContent = loading
					? "Loading games…"
					: games.length
						? "No games match your search."
						: "No games found.";
			}
			return;
		}
		if (empty) empty.hidden = true;

		const page = sorted.slice(0, shown);
		for (const g of page) {
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

		if (sorted.length > shown) {
			const more = xel("button");
			more.className = "game-loadmore";
			const remaining = sorted.length - shown;
			more.textContent = `Load more (${remaining})`;
			more.addEventListener("click", () => {
				shown += PAGE_SIZE;
				render();
			});
			grid.appendChild(more);
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

	function openPanel() {
		panel.classList.add("show");
		panel.setAttribute("aria-hidden", "false");
		if (searchEl) setTimeout(() => searchEl.focus(), 0); // focus search on open
	}
	function closePanel() {
		panel.classList.remove("show");
		panel.setAttribute("aria-hidden", "true");
	}

	if (openBtn)
		openBtn.addEventListener("click", (e) => {
			e.preventDefault();
			openPanel();
		});
	if (closeBtn) closeBtn.addEventListener("click", closePanel);
	if (vBack) vBack.addEventListener("click", closeGame);

	if (searchEl)
		searchEl.addEventListener("input", () => {
			currentSearch = searchEl.value;
			shown = PAGE_SIZE; // new query -> back to the first page
			try {
				localStorage.setItem(SEARCH_KEY, currentSearch);
			} catch {
				/* ignore */
			}
			render();
		});

	// "Surprise me": open a random game from the current (search-filtered) list.
	if (randomBtn)
		randomBtn.addEventListener("click", () => {
			const pool = visibleGames();
			if (!pool.length) return;
			openGame(pool[Math.floor(Math.random() * pool.length)]);
		});

	// Escape closes the game player first, then the panel.
	document.addEventListener("keydown", (e) => {
		if (e.key !== "Escape") return;
		if (view && view.classList.contains("show")) closeGame();
		else if (panel.classList.contains("show")) closePanel();
	});

	/* Games are fetched from the Lumin (Daknux) collection at runtime and
	 * normalized to the {id, name, file, icon} shape the grid uses, so they render
	 * and play through the card + credentialless-iframe player. */
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
		render(); // show the "Loading games…" state right away
		try {
			games = await loadCollections();
		} catch {
			games = [];
		}
		loading = false;
		render();
	}

	loadAll();
})();
