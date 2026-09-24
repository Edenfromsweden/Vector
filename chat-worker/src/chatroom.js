// One chat room. A Durable Object gives every connected client in the same room
// a single shared instance, so we can broadcast messages between them and keep a
// short in-memory history to show people who just joined.
//
// Safety notes (usernames are unauthenticated — anyone can pick any name):
//  - message + name lengths are capped;
//  - a simple per-connection rate limit throttles spam;
//  - the frontend renders every message as plain text (never HTML), so a
//    message can't inject markup into anyone else's page.

const MAX_NAME = 24;
const MAX_TEXT = 500;
const HISTORY = 50;
const MIN_INTERVAL_MS = 400; // per connection

export class ChatRoom {
	constructor(state) {
		this.state = state;
		this.sessions = new Set();
		this.history = [];
	}

	async fetch(request) {
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("expected a websocket", { status: 426 });
		}
		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];
		this.accept(server);
		return new Response(null, { status: 101, webSocket: client });
	}

	accept(ws) {
		ws.accept();
		const session = { ws, name: "anon", last: 0 };
		this.sessions.add(session);

		// Send recent history so a new joiner sees the last few messages.
		try {
			ws.send(JSON.stringify({ type: "history", messages: this.history }));
		} catch {
			/* ignore */
		}

		ws.addEventListener("message", (ev) => {
			let data;
			try {
				data = JSON.parse(ev.data);
			} catch {
				return;
			}
			if (!data || typeof data !== "object") return;

			if (data.type === "join") {
				session.name = cleanName(data.name);
				this.broadcast({
					type: "system",
					text: `${session.name} joined`,
					ts: Date.now(),
				});
				this.broadcastRoster();
				return;
			}

			if (data.type === "msg") {
				const now = Date.now();
				if (now - session.last < MIN_INTERVAL_MS) return; // rate limit
				session.last = now;
				const text = String(data.text == null ? "" : data.text)
					.slice(0, MAX_TEXT)
					.trim();
				if (!text) return;
				const msg = { type: "msg", name: session.name, text, ts: now };
				this.history.push(msg);
				if (this.history.length > HISTORY) this.history.shift();
				this.broadcast(msg);
			}
		});

		const close = () => {
			if (this.sessions.delete(session)) {
				this.broadcast({
					type: "system",
					text: `${session.name} left`,
					ts: Date.now(),
				});
				this.broadcastRoster();
			}
		};
		ws.addEventListener("close", close);
		ws.addEventListener("error", close);
	}

	broadcast(obj) {
		const s = JSON.stringify(obj);
		for (const sess of this.sessions) {
			try {
				sess.ws.send(s);
			} catch {
				this.sessions.delete(sess);
			}
		}
	}

	// The list of names currently in the room (deduped), for the who's-online UI.
	broadcastRoster() {
		const seen = new Set();
		const users = [];
		for (const sess of this.sessions) {
			const n = sess.name || "anon";
			if (!seen.has(n)) {
				seen.add(n);
				users.push(n);
			}
		}
		this.broadcast({ type: "roster", users });
	}
}

function cleanName(n) {
	const s = String(n == null ? "" : n)
		.replace(/[\u0000-\u001f]/g, "")
		.trim()
		.slice(0, MAX_NAME);
	return s || "anon";
}
