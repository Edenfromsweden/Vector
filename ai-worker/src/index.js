// Vector AI backend. A Cloudflare Worker that answers chat requests using
// Cloudflare Workers AI (free daily quota, no API key needed — the model runs
// on the AI binding). A per-user daily token cap, stored in D1 and keyed by the
// UTC day, resets at 00:00 UTC — the same time Cloudflare's free AI quota resets.
//
//   POST /api/chat  { messages: [{role, content}, ...] }  -> { reply, used, limit }
//
// Deploy this folder as a Worker with an [ai] binding and a D1 database bound as
// USAGE (see ai-worker/README.md).

const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const MAX_MSGS = 24;
const MAX_LEN = 4000;
const MAX_TOKENS = 512; // cap per reply
const DAILY_LIMIT = 20000; // tokens per user per UTC day — tune to taste
const SYSTEM =
	"You are Vector's helpful, friendly AI assistant. Keep answers clear and " +
	"concise. If you don't know something, say so.";

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

function sanitize(messages) {
	if (!Array.isArray(messages)) return [];
	return messages
		.filter(
			(m) =>
				m &&
				(m.role === "user" || m.role === "assistant") &&
				typeof m.content === "string" &&
				m.content.trim()
		)
		.slice(-MAX_MSGS)
		.map((m) => ({ role: m.role, content: m.content.slice(0, MAX_LEN) }));
}

const utcDay = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
const estTokens = (s) => Math.ceil((s || "").length / 4); // rough fallback

let ready = false;
async function ensure(db) {
	if (ready) return;
	await db
		.prepare(
			"CREATE TABLE IF NOT EXISTS usage (id TEXT, day TEXT, tokens INTEGER, PRIMARY KEY (id, day))"
		)
		.run();
	ready = true;
}

export default {
	async fetch(request, env) {
		if (request.method === "OPTIONS")
			return new Response(null, { headers: CORS });

		const url = new URL(request.url);
		if (url.pathname === "/" || url.pathname === "")
			return new Response("vector ai ok", {
				headers: { "content-type": "text/plain", ...CORS },
			});
		if (url.pathname !== "/api/chat") return json({ error: "not found" }, 404);
		if (request.method !== "POST") return json({ error: "POST only" }, 405);
		if (!env.AI) return json({ error: "no AI binding" }, 500);
		if (!env.USAGE) return json({ error: "no usage database" }, 500);

		await ensure(env.USAGE);

		let body = {};
		try {
			body = await request.json();
		} catch {
			body = {};
		}
		const messages = sanitize(body.messages);
		if (!messages.length) return json({ error: "no messages" }, 400);

		// Per-user daily cap, keyed by IP + UTC day (resets at 00:00 UTC).
		const id = request.headers.get("CF-Connecting-IP") || "unknown";
		const day = utcDay();
		const row = await env.USAGE.prepare(
			"SELECT tokens FROM usage WHERE id = ? AND day = ?"
		)
			.bind(id, day)
			.first();
		const used = (row && row.tokens) || 0;

		if (used >= DAILY_LIMIT) {
			const resetsInMin = Math.ceil(
				(Date.parse(day + "T24:00:00Z") - Date.now()) / 60000
			);
			return json(
				{
					error: "daily_limit",
					used,
					limit: DAILY_LIMIT,
					message: `You've used your AI tokens for today. Resets in ~${resetsInMin} min.`,
				},
				429
			);
		}

		let out;
		try {
			out = await env.AI.run(MODEL, {
				messages: [{ role: "system", content: SYSTEM }, ...messages],
				max_tokens: MAX_TOKENS,
			});
		} catch {
			return json({ error: "the AI service failed" }, 502);
		}

		const reply = (out && (out.response || out.text)) || "";
		const spent =
			(out && out.usage && out.usage.total_tokens) ||
			estTokens(messages.map((m) => m.content).join(" ")) + estTokens(reply);

		const newUsed = used + spent;
		await env.USAGE.prepare(
			"INSERT INTO usage (id, day, tokens) VALUES (?, ?, ?) ON CONFLICT(id, day) DO UPDATE SET tokens = ?"
		)
			.bind(id, day, newUsed, newUsed)
			.run();
		// prune previous days
		await env.USAGE.prepare("DELETE FROM usage WHERE day < ?").bind(day).run();

		return json({ reply, used: newUsed, limit: DAILY_LIMIT });
	},
};
