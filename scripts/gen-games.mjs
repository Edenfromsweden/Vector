// Scans a folder of game .html files and returns a manifest.
// A game's display name comes from its <title>, else its prettified filename.
import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function scanGames(gamesDir) {
	if (!existsSync(gamesDir)) return [];
	return readdirSync(gamesDir)
		.filter((f) => /\.html?$/i.test(f))
		.map((f) => {
			const html = readFileSync(`${gamesDir}/${f}`, "utf8");
			const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1];
			const base = f.replace(/\.html?$/i, "");
			const name =
				(title && title.trim()) ||
				base.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
			return { id: base, name, file: `games/${f}` };
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
