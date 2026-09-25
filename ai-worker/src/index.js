// Vector AI backend. A Cloudflare Worker that proxies chat requests to the
// DeepSeek API (OpenAI-compatible). The API key lives as a Worker secret
// (DEEPSEEK_API_KEY) and never touches the browser.
//
//   POST /api/chat  { messages: [{role, content}, ...] }  -> { reply }
//
// Deploy this folder as a Worker and set the secret (see ai-worker/README.md).

const MAX_MSGS = 24; // most recent turns to forward
const MAX_LEN = 4000; // per-message character cap
const MODEL = "deepseek-chat"; // DeepSeek V3; "deepseek-reasoner" for R1
const ENDPOINT = "https://api.deepseek.com/chat/completions";
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

// Keep only well-formed user/assistant turns, trimmed and length-capped.
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
		if (!env.DEEPSEEK_API_KEY)
			return json({ error: "server missing DEEPSEEK_API_KEY" }, 500);

		let body = {};
		try {
			body = await request.json();
		} catch {
			body = {};
		}
		const messages = sanitize(body.messages);
		if (!messages.length) return json({ error: "no messages" }, 400);

		let upstream;
		try {
			upstream = await fetch(ENDPOINT, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
				},
				body: JSON.stringify({
					model: MODEL,
					messages: [{ role: "system", content: SYSTEM }, ...messages],
					max_tokens: 1024,
					stream: false,
				}),
			});
		} catch {
			return json({ error: "could not reach the AI service" }, 502);
		}

		if (!upstream.ok) {
			const detail = (await upstream.text()).slice(0, 500);
			return json({ error: "ai service error", status: upstream.status, detail }, 502);
		}

		const data = await upstream.json();
		const reply =
			(data.choices &&
				data.choices[0] &&
				data.choices[0].message &&
				data.choices[0].message.content) ||
			"";
		return json({ reply });
	},
};
