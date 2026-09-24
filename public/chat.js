"use strict";

/* Chat panel. Talks to the chat-worker backend over a WebSocket — pick a
 * username, then join the public lobby or a private room by code. Messages are
 * rendered as plain text (textContent) so nothing another user types can inject
 * markup into your page. Set CHAT_URL to wherever you deployed chat-worker. */
(function () {
	const xel =
		window.xel ||
		((t) => document.createElementNS("http://www.w3.org/1999/xhtml", t));

	// Where the chat-worker is deployed. Override by setting window.CHAT_URL, or
	// edit this default to your Worker's wss:// URL (see chat-worker/README).
	const CHAT_URL = (window.CHAT_URL || "wss://chat.zilkcz.com/").replace(
		/\/*$/,
		"/"
	);
	const NAME_KEY = "vector_chat_name";

	const panel = document.getElementById("chat");
	if (!panel) return;
	const openBtn = document.getElementById("open-chat");
	const closeBtn = document.getElementById("chat-close");

	const setup = document.getElementById("chat-setup");
	const nameEl = document.getElementById("chat-name");
	const joinPublic = document.getElementById("chat-join-public");
	const codeEl = document.getElementById("chat-code");
	const joinCode = document.getElementById("chat-join-code");

	const roomView = document.getElementById("chat-room");
	const roomNameEl = document.getElementById("chat-room-name");
	const statusEl = document.getElementById("chat-status");
	const logEl = document.getElementById("chat-log");
	const form = document.getElementById("chat-form");
	const input = document.getElementById("chat-input");
	const leaveBtn = document.getElementById("chat-leave");

	let ws = null;
	let room = null;
	let wantOpen = false; // are we meant to be connected right now?

	try {
		const saved = localStorage.getItem(NAME_KEY);
		if (saved && nameEl) nameEl.value = saved;
	} catch {
		/* ignore */
	}

	function setStatus(s) {
		if (statusEl) statusEl.textContent = s;
	}

	function addLine(kind, name, text, ts) {
		const line = xel("div");
		line.className = "chat-line" + (kind === "system" ? " system" : "");
		if (kind === "system") {
			line.textContent = text;
		} else {
			const who = xel("span");
			who.className = "chat-who";
			who.textContent = name;
			const body = xel("span");
			body.className = "chat-text";
			body.textContent = text;
			line.append(who, body);
		}
		if (ts) line.title = new Date(ts).toLocaleString();
		const atBottom =
			logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
		logEl.appendChild(line);
		if (atBottom) logEl.scrollTop = logEl.scrollHeight;
	}

	function cleanRoom(v) {
		return String(v || "")
			.trim()
			.replace(/[^A-Za-z0-9_-]/g, "")
			.slice(0, 32)
			.toLowerCase();
	}

	function connect(target) {
		room = target;
		wantOpen = true;
		setup.hidden = true;
		roomView.hidden = false;
		roomNameEl.textContent = target === "public" ? "Public lobby" : `#${target}`;
		logEl.textContent = "";
		open();
	}

	function open() {
		if (!wantOpen) return;
		setStatus("connecting…");
		try {
			ws = new WebSocket(CHAT_URL + "room/" + encodeURIComponent(room));
		} catch {
			setStatus("bad chat URL");
			return;
		}
		const name = getName();
		ws.addEventListener("open", () => {
			setStatus("connected");
			ws.send(JSON.stringify({ type: "join", name }));
			if (input) input.focus();
		});
		ws.addEventListener("message", (ev) => {
			let d;
			try {
				d = JSON.parse(ev.data);
			} catch {
				return;
			}
			if (d.type === "history" && Array.isArray(d.messages)) {
				for (const m of d.messages) addLine("msg", m.name, m.text, m.ts);
			} else if (d.type === "msg") {
				addLine("msg", d.name, d.text, d.ts);
			} else if (d.type === "system") {
				addLine("system", null, d.text, d.ts);
			}
		});
		ws.addEventListener("close", () => {
			if (!wantOpen) return;
			setStatus("reconnecting…");
			setTimeout(open, 1500); // retry while we still want to be in the room
		});
		ws.addEventListener("error", () => setStatus("connection error"));
	}

	function disconnect() {
		wantOpen = false;
		if (ws) {
			try {
				ws.close();
			} catch {
				/* ignore */
			}
			ws = null;
		}
	}

	function getName() {
		let n = (nameEl && nameEl.value ? nameEl.value : "").trim().slice(0, 24);
		if (!n) n = "anon";
		try {
			localStorage.setItem(NAME_KEY, n);
		} catch {
			/* ignore */
		}
		return n;
	}

	function leave() {
		disconnect();
		roomView.hidden = true;
		setup.hidden = false;
	}

	if (joinPublic) joinPublic.addEventListener("click", () => connect("public"));
	if (joinCode)
		joinCode.addEventListener("click", () => {
			const code = cleanRoom(codeEl && codeEl.value);
			if (code) connect(code);
			else if (codeEl) codeEl.focus();
		});
	if (codeEl)
		codeEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				joinCode.click();
			}
		});
	if (leaveBtn) leaveBtn.addEventListener("click", leave);

	if (form)
		form.addEventListener("submit", (e) => {
			e.preventDefault();
			const text = (input.value || "").trim();
			if (!text || !ws || ws.readyState !== 1) return;
			ws.send(JSON.stringify({ type: "msg", text }));
			input.value = "";
		});

	function openPanel() {
		panel.classList.add("show");
		panel.setAttribute("aria-hidden", "false");
		if (setup.hidden === false && nameEl) nameEl.focus();
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
