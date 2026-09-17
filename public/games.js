"use strict";

/* Games section: reads games.json, renders a grid, plays games in an overlay,
 * lets you download a game's HTML, and stores favorites in a cookie. */
(function () {
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
			const card = document.createElement("div");
			card.className = "game-card";

			const play = document.createElement("button");
			play.className = "game-play";
			play.title = "Play " + g.name;

			const cover = document.createElement("span");
			cover.className = "game-cover";
			if (g.icon) {
				const img = document.createElement("img");
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

			const nameEl = document.createElement("span");
			nameEl.className = "game-name";
			nameEl.textContent = g.name;

			play.append(cover, nameEl);
			play.addEventListener("click", () => openGame(g));

			const actions = document.createElement("div");
			actions.className = "game-actions";

			const fav = document.createElement("button");
			fav.className = "game-fav" + (isFav(g.id) ? " on" : "");
			fav.textContent = isFav(g.id) ? STAR : STAR_O;
			fav.title = "Favorite";
			fav.setAttribute("aria-pressed", isFav(g.id) ? "true" : "false");
			fav.addEventListener("click", (e) => {
				e.stopPropagation();
				toggleFav(g.id);
				render();
			});

			const dl = document.createElement("a");
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
