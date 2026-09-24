// Vector chat backend (free tier). A Cloudflare Worker backed by a D1 database —
// no Durable Objects, so it runs on the free Workers plan. Clients poll for new
// messages every couple of seconds and post their own; presence rows track who
// is currently in a room for the who's-online list.
//
// Endpoints (all JSON, CORS-open so the site can call it cross-origin):
//   POST /api/poll  { room, name, since }  -> { messages, roster, last }
//   POST /api/send  { room, name, text }   -> { ok, id }
//
// Deploy: connect this folder as a Worker and bind a D1 database as DB
// (see chat-worker/README.md).

const MAX_NAME = 24;
const MAX_TEXT = 500;
const HISTORY = 60; // messages returned to a fresh joiner
const PRESENCE_MS = 20000; // "online" if seen within this window
const KEEP = 300; // messages kept per room

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "content-type",
};

function json(obj, status = 200) {
	return new Response(JSON.stringify(obj), {
		status,
		headers: { "content-type": "application/json", ...CORS },
	});
}

function cleanRoom(v) {
	return String(v || "")
		.trim()
		.replace(/[^A-Za-z0-9_-]/g, "")
		.slice(0, 32)
		.toLowerCase();
}
function cleanName(v) {
	return (
		String(v == null ? "" : v)
			.replace(/[\u0000-\u001f]/g, "")
			.trim()
			.slice(0, MAX_NAME) || "anon"
	);
}

let ready = false;
async function ensure(db) {
	if (ready) return;
	await db.batch([
		db.prepare(
			"CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT, name TEXT, text TEXT, ts INTEGER)"
		),
		db.prepare(
			"CREATE INDEX IF NOT EXISTS idx_msg_room ON messages (room, id)"
		),
		db.prepare(
			"CREATE TABLE IF NOT EXISTS presence (room TEXT, name TEXT, ts INTEGER, PRIMARY KEY (room, name))"
		),
	]);
	ready = true;
}

export default {
	async fetch(request, env) {
		if (request.method === "OPTIONS")
			return new Response(null, { headers: CORS });

		const url = new URL(request.url);
		if (url.pathname === "/" || url.pathname === "")
			return new Response("vector chat ok", {
				headers: { "content-type": "text/plain", ...CORS },
			});

		if (!env.DB) return json({ error: "no database bound" }, 500);
		await ensure(env.DB);

		let body = {};
		if (request.method === "POST") {
			try {
				body = await request.json();
			} catch {
				body = {};
			}
		}
		const room = cleanRoom(body.room);
		if (!room) return json({ error: "bad room" }, 400);

		if (url.pathname === "/api/send") {
			const name = cleanName(body.name);
			const text = String(body.text == null ? "" : body.text)
				.slice(0, MAX_TEXT)
				.trim();
			if (!text) return json({ error: "empty" }, 400);
			const ts = Date.now();
			const res = await env.DB.prepare(
				"INSERT INTO messages (room, name, text, ts) VALUES (?, ?, ?, ?)"
			)
				.bind(room, name, text, ts)
				.run();
			// prune old messages for this room
			await env.DB.prepare(
				"DELETE FROM messages WHERE room = ? AND id <= (SELECT MAX(id) FROM messages WHERE room = ?) - ?"
			)
				.bind(room, room, KEEP)
				.run();
			return json({ ok: true, id: res.meta.last_row_id, ts });
		}

		if (url.pathname === "/api/poll") {
			const name = cleanName(body.name);
			const since = Number(body.since) || 0;
			const now = Date.now();

			// heartbeat this user's presence, then drop stale rows
			await env.DB.prepare(
				"INSERT INTO presence (room, name, ts) VALUES (?, ?, ?) ON CONFLICT(room, name) DO UPDATE SET ts = excluded.ts"
			)
				.bind(room, name, now)
				.run();
			await env.DB.prepare("DELETE FROM presence WHERE ts < ?")
				.bind(now - PRESENCE_MS * 3)
				.run();

			// new messages: everything after `since`, or the last HISTORY on first poll
			let messages;
			if (since > 0) {
				messages = await env.DB.prepare(
					"SELECT id, name, text, ts FROM messages WHERE room = ? AND id > ? ORDER BY id ASC LIMIT 200"
				)
					.bind(room, since)
					.all();
			} else {
				const recent = await env.DB.prepare(
					"SELECT id, name, text, ts FROM messages WHERE room = ? ORDER BY id DESC LIMIT ?"
				)
					.bind(room, HISTORY)
					.all();
				messages = { results: (recent.results || []).reverse() };
			}

			const roster = await env.DB.prepare(
				"SELECT DISTINCT name FROM presence WHERE room = ? AND ts > ? ORDER BY name"
			)
				.bind(room, now - PRESENCE_MS)
				.all();

			const rows = messages.results || [];
			const last = rows.length ? rows[rows.length - 1].id : since;
			return json({
				messages: rows,
				roster: (roster.results || []).map((r) => r.name),
				last,
			});
		}

		return json({ error: "not found" }, 404);
	},
};
