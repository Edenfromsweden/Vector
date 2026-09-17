// Scans a folder of game .html files and returns a manifest.
// - name: derived from the filename (reliable, unlike saved-page <title> tags).
// - icon: the game's favicon, resolved against its <base href> when present, so
//   each card can show the game's own icon instead of text.
import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function scanGames(gamesDir) {
	if (!existsSync(gamesDir)) return [];
	return readdirSync(gamesDir)
		.filter((f) => /\.html?$/i.test(f))
		.map((f) => {
			const id = f.replace(/\.html?$/i, "");
			const name = id.replace(/[_-]+/g, " ").trim();
			const html = readFileSync(`${gamesDir}/${f}`, "utf8");
			const baseHref = (html.match(/<base[^>]*href="([^"]+)"/i) || [])[1];
			const iconHref =
				(html.match(
					/<link[^>]*rel="[^"]*icon[^"]*"[^>]*href="([^"]+)"/i
				) || [])[1] ||
				(html.match(
					/<link[^>]*href="([^"]+)"[^>]*rel="[^"]*icon[^"]*"/i
				) || [])[1];
			let icon = null;
			try {
				if (baseHref) icon = new URL(iconHref || "favicon.png", baseHref).href;
				else if (iconHref && /^https?:/i.test(iconHref)) icon = iconHref;
			} catch {
				/* leave icon null */
			}
			return { id, name, file: `games/${f}`, icon };
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

// Run directly (`node scripts/gen-games.mjs`) -> refresh public/games.json for local dev.
const invoked = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/gen-games.mjs");
if (invoked) {
	const pub = fileURLToPath(new URL("../public", import.meta.url));
	const games = scanGames(`${pub}/games`);
	writeFileSync(`${pub}/games.json`, JSON.stringify(games, null, 2) + "\n");
	console.log(`Wrote public/games.json (${games.length} game(s))`);
}
