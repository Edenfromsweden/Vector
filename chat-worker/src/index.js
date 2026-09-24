// Vector chat backend: a Cloudflare Worker that routes each room to a Durable
// Object (one instance per room name), which relays WebSocket messages between
// everyone connected to that room and keeps a little recent history.
//
// Rooms:
//   /room/public         -> the shared public lobby
//   /room/<code>         -> a private room; friends join by sharing <code>
//
// Deploy from this folder with:  npx wrangler deploy   (see chat-worker/README).

export { ChatRoom } from "./chatroom.js";

const ROOM_RE = /^\/room\/([A-Za-z0-9_-]{1,32})$/;

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		// CORS/health for a plain GET at the root.
		if (url.pathname === "/" || url.pathname === "") {
			return new Response("vector chat ok", {
				headers: { "content-type": "text/plain" },
			});
		}

		const m = url.pathname.match(ROOM_RE);
		if (!m) return new Response("not found", { status: 404 });

		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("expected a websocket", { status: 426 });
		}

		// One Durable Object per room name; case-insensitive.
		const room = m[1].toLowerCase();
		const id = env.CHAT_ROOM.idFromName(room);
		const stub = env.CHAT_ROOM.get(id);
		return stub.fetch(request);
	},
};
