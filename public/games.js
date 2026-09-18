"use strict";

/* Games section: reads games.json, renders a grid, opens a game by navigating
 * to its HTML file, lets you download it, and stores favorites in a cookie.
 *
 * Games are NOT framed. The host serving them refuses to be embedded, so an
 * iframe just shows "refused to connect"; navigating to the file avoids the
 * framing headers entirely. Back returns here. */
(function () {
	const xel =
		window.xel ||
		((t) => document.createElementNS("http://www.w3.org/1999/xhtml", t));

	const grid = document.getElementById("games-grid");
	const empty = document.getElementById("games-empty");
	const panel = document.getElementById("games");
	const openBtn = document.getElementById("open-games");
	const closeBtn = document.getElementById("games-close");

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

	function fileName(path) {
		return path.split("/").pop();
	}

	function render() {
		const favs = getFavs();
		const sorted = games.slice().sort((a, b) => {
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
		if (!g || !g.file) return;
		// Open the game in the standalone viewer (games/play.html), which carries
		// the back/favorite/download bar and frames the game. The viewer is not
		// cross-origin-isolated, so -- unlike the app shell -- it can embed a game
		// that loads third-party assets. Navigate to it rather than framing it
		// here.
		const params = new URLSearchParams({
			src: g.file,
			name: g.name || "Game",
			id: g.id || "",
		});
		window.location.href = "games/play.html?" + params.toString();
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

	fetch("games.json", { cache: "no-store" })
		.then((r) => (r.ok ? r.json() : []))
		.then((list) => {
			games = Array.isArray(list) ? list : [];
			render();
		})
		.catch(() => {
			games = [];
			render();
		});
})();
