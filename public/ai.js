"use strict";

/* AI assistant panel. Sends the conversation to the ai-worker backend (Cloudflare
 * Workers AI) and shows the reply. Replies render as plain text (textContent), so
 * nothing the model returns can inject markup. Point AI_URL at your deployed
 * ai-worker (see ai-worker/README.md). */
(function () {
	const xel =
		window.xel ||
		((t) => document.createElementNS("http://www.w3.org/1999/xhtml", t));

	// HTTPS base of your deployed ai-worker.
	const AI_URL = (window.AI_URL || "https://vectorai.zilkcz.com/").replace(
		/\/*$/,
		"/"
	);

	const panel = document.getElementById("ai");
	if (!panel) return;
	const openBtn = document.getElementById("open-ai");
	const closeBtn = document.getElementById("ai-close");
	const logEl = document.getElementById("ai-log");
	const form = document.getElementById("ai-form");
	const input = document.getElementById("ai-input");
	const clearBtn = document.getElementById("ai-clear");

	// Conversation history sent to the model each turn.
	let history = [];
	let busy = false;

	function addLine(role, text, opts) {
		const line = xel("div");
		line.className =
			"ai-line " + (role === "user" ? "user" : role === "system" ? "sys" : "bot");
		if (role !== "user" && role !== "system") {
			const who = xel("span");
			who.className = "ai-who";
			who.textContent = "AI";
			line.appendChild(who);
		}
		const body = xel("span");
		body.className = "ai-text";
		body.textContent = text;
		line.appendChild(body);
		if (opts && opts.pending) line.classList.add("pending");
		logEl.appendChild(line);
		logEl.scrollTop = logEl.scrollHeight;
		return line;
	}

	async function send(text) {
		if (busy) return;
		busy = true;
		history.push({ role: "user", content: text });
		addLine("user", text);
		const pending = addLine("bot", "…", { pending: true });

		try {
			const res = await fetch(AI_URL + "api/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ messages: history }),
			});
			const data = await res.json().catch(() => ({}));
			if (res.status === 429) {
				pending.remove();
				addLine("system", data.message || "Daily AI limit reached.");
			} else if (!res.ok || !data.reply) {
				pending.remove();
				addLine("system", data.error ? `Error: ${data.error}` : "Something went wrong.");
			} else {
				pending.querySelector(".ai-text").textContent = data.reply;
				pending.classList.remove("pending");
				history.push({ role: "assistant", content: data.reply });
			}
		} catch {
			pending.remove();
			addLine("system", "Couldn't reach the AI service.");
		}
		busy = false;
		if (input) input.focus();
	}

	if (form)
		form.addEventListener("submit", (e) => {
			e.preventDefault();
			const text = (input.value || "").trim();
			if (!text) return;
			input.value = "";
			send(text);
		});

	if (clearBtn)
		clearBtn.addEventListener("click", () => {
			history = [];
			logEl.textContent = "";
			addLine("system", "New chat — say hi 👋");
			if (input) input.focus();
		});

	function openPanel() {
		panel.classList.add("show");
		panel.setAttribute("aria-hidden", "false");
		if (!logEl.childNodes.length) addLine("system", "Ask me anything.");
		if (input) input.focus();
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
