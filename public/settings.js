"use strict";

/* Settings panel: theme picker. Themes are CSS-variable sets defined in
 * index.css under :root[data-theme="…"]; selecting one sets that attribute on
 * <html>, saves it, and fires a "vector-theme" event so bg.js recolours the
 * aurora. Applied as early as this script runs to minimise any flash. */
(function () {
	const xel =
		window.xel ||
		((t) => document.createElementNS("http://www.w3.org/1999/xhtml", t));

	const THEME_KEY = "vector_theme";
	// id "" = the default palette (no data-theme attribute). sw = swatch colours.
	const THEMES = [
		{ id: "", name: "Vector", sw: ["#a78bfa", "#6495ed"] },
		{ id: "ocean", name: "Ocean", sw: ["#60a5fa", "#22d3ee"] },
		{ id: "emerald", name: "Emerald", sw: ["#34d399", "#a3e635"] },
		{ id: "crimson", name: "Crimson", sw: ["#fb7185", "#f97316"] },
		{ id: "amber", name: "Amber", sw: ["#fbbf24", "#fde047"] },
		{ id: "rose", name: "Rose", sw: ["#f472b6", "#a855f7"] },
		{ id: "mono", name: "Mono", sw: ["#d1d5db", "#9ca3af"] },
	];

	function currentTheme() {
		try {
			return localStorage.getItem(THEME_KEY) || "";
		} catch {
			return "";
		}
	}

	function applyTheme(id) {
		const root = document.documentElement;
		if (id) root.setAttribute("data-theme", id);
		else root.removeAttribute("data-theme");
		try {
			localStorage.setItem(THEME_KEY, id);
		} catch {
			/* ignore */
		}
		// Let bg.js re-read the aurora palette. Wait a frame so the new CSS
		// variables are in effect before it reads them.
		requestAnimationFrame(() =>
			window.dispatchEvent(new Event("vector-theme"))
		);
	}

	// Apply the saved theme immediately on load.
	applyTheme(currentTheme());

	const panel = document.getElementById("settings");
	const openBtn = document.getElementById("open-settings");
	const closeBtn = document.getElementById("settings-close");
	const gridEl = document.getElementById("theme-grid");
	if (!panel || !gridEl) return;

	function renderThemes() {
		const active = currentTheme();
		gridEl.textContent = "";
		for (const t of THEMES) {
			const btn = xel("button");
			btn.type = "button";
			btn.className = "theme-swatch" + (t.id === active ? " on" : "");
			btn.title = t.name;
			btn.setAttribute("aria-pressed", t.id === active ? "true" : "false");

			const chip = xel("span");
			chip.className = "theme-chip";
			chip.style.background = `linear-gradient(135deg, ${t.sw[0]}, ${t.sw[1]})`;

			const label = xel("span");
			label.className = "theme-name";
			label.textContent = t.name;

			btn.append(chip, label);
			btn.addEventListener("click", () => {
				applyTheme(t.id);
				renderThemes();
			});
			gridEl.appendChild(btn);
		}
	}
	renderThemes();

	function openPanel() {
		panel.classList.add("show");
		panel.setAttribute("aria-hidden", "false");
	}
	function closePanel() {
		panel.classList.remove("show");
		panel.setAttribute("aria-hidden", "true");
	}

	if (openBtn) openBtn.addEventListener("click", openPanel);
	if (closeBtn) closeBtn.addEventListener("click", closePanel);
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && panel.classList.contains("show")) closePanel();
	});
})();
