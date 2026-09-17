export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const res = await env.ASSETS.fetch(request);
		const headers = new Headers(res.headers);
		// Cross-origin isolation for the proxy shell — but NOT for /games/,
		// whose pages load cross-origin assets that require-corp would block.
		if (!url.pathname.startsWith("/games/")) {
			headers.set("Cross-Origin-Opener-Policy", "same-origin");
			headers.set("Cross-Origin-Embedder-Policy", "require-corp");
		}
		if (url.pathname === "/" || url.pathname.endsWith(".html")) {
			headers.set("Cache-Control", "no-cache");
		}
		return new Response(res.body, {
			status: res.status,
			statusText: res.statusText,
			headers,
		});
	},
};
