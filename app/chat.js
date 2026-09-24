"use strict";

/* Chat panel. Login gate -> pick a username -> join the public lobby or a
 * private room by code. Shows who's online and message timestamps, and lets you
 * mute people (client-side). Messages render as plain text (textContent) so
 * nothing another user types can inject markup. Point CHAT_URL at your deployed
 * chat-worker (see chat-worker/README).
 *
 * The login password is NOT stored here — only a SHA-256 hash of it is. The
 * entered password is hashed and compared to the hash, so the real password
 * can't be read out of this file. (A client-side gate still only keeps out
 * casual snooping; it isn't real server-side security.) */
(function () {
	const xel =
		window.xel ||
		((t) => document.createElementNS("http://www.w3.org/1999/xhtml", t));

	const CHAT_URL = (window.CHAT_URL || "wss://chat.zilkcz.com/").replace(
		/\/*$/,
		"/"
	);
	const NAME_KEY = "vector_chat_name";
	const AUTH_KEY = "vector_chat_auth";
	const MUTE_KEY = "vector_chat_muted";
	// SHA-256 of the login password. The plaintext is intentionally absent.
	const PASS_HASH =
		"15d489b45f0d3f5885d42dc869e2427a106d6ecf9bea697a850aada09e0103bd";

	const panel = document.getElementById("chat");
	if (!panel) return;
	const openBtn = document.getElementById("open-chat");
	const closeBtn = document.getElementById("chat-close");

	const loginView = document.getElementById("chat-login");
	const passEl = document.getElementById("chat-pass");
	const loginBtn = document.getElementById("chat-login-btn");
	const loginErr = document.getElementById("chat-login-err");

	const setup = document.getElementById("chat-setup");
	const nameEl = document.getElementById("chat-name");
	const joinPublic = document.getElementById("chat-join-public");
	const codeEl = document.getElementById("chat-code");
	const joinCode = document.getElementById("chat-join-code");

	const roomView = document.getElementById("chat-room");
	const roomNameEl = document.getElementById("chat-room-name");
	const statusEl = document.getElementById("chat-status");
	const rosterEl = document.getElementById("chat-roster");
	const logEl = document.getElementById("chat-log");
	const form = document.getElementById("chat-form");
	const input = document.getElementById("chat-input");
	const leaveBtn = document.getElementById("chat-leave");

	let ws = null;
	let room = null;
	let wantOpen = false;

	function loadMuted() {
		try {
			return new Set(JSON.parse(localStorage.getItem(MUTE_KEY) || "[]"));
		} catch {
			return new Set();
		}
	}
	let muted = loadMuted();
	function saveMuted() {
		try {
			localStorage.setItem(MUTE_KEY, JSON.stringify([...muted]));
		} catch {
			/* ignore */
		}
	}

	try {
		const saved = localStorage.getItem(NAME_KEY);
		if (saved && nameEl) nameEl.value = saved;
	} catch {
		/* ignore */
	}

	// ---- views -------------------------------------------------------------
	function isAuthed() {
		try {
			return localStorage.getItem(AUTH_KEY) === "1";
		} catch {
			return false;
		}
	}
	function show(view) {
		loginView.hidden = view !== "login";
		setup.hidden = view !== "setup";
		roomView.hidden = view !== "room";
	}

	async function sha256(str) {
		const buf = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(str)
		);
		return [...new Uint8Array(buf)]
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}

	async function tryLogin() {
		loginErr.textContent = "";
		const val = passEl ? passEl.value : "";
		let hash = "";
		try {
			hash = await sha256(val);
		} catch {
			loginErr.textContent = "Login needs a secure (https) connection.";
			return;
		}
		if (hash === PASS_HASH) {
			try {
				localStorage.setItem(AUTH_KEY, "1");
			} catch {
				/* ignore */
			}
			if (passEl) passEl.value = "";
			show("setup");
			if (nameEl) nameEl.focus();
		} else {
			loginErr.textContent = "Wrong password.";
			if (passEl) passEl.select();
		}
	}

	// ---- roster + mute -----------------------------------------------------
	function renderRoster(users) {
		if (!rosterEl) return;
		rosterEl.textContent = "";
		const title = xel("span");
		title.className = "chat-roster-title";
		title.textContent = `Online (${users.length})`;
		rosterEl.appendChild(title);
		for (const u of users) {
			const chip = xel("button");
			chip.type = "button";
			chip.className = "chat-user" + (muted.has(u) ? " muted" : "");
			chip.textContent = u;
			chip.title = muted.has(u) ? "Unmute " + u : "Mute " + u;
			chip.addEventListener("click", () => toggleMute(u));
			rosterEl.appendChild(chip);
		}
	}
	function toggleMute(name) {
		if (muted.has(name)) muted.delete(name);
		else muted.add(name);
		saveMuted();
		// hide/show existing lines from that person, and refresh roster styles
		for (const line of logEl.querySelectorAll(".chat-line[data-name]")) {
			if (line.dataset.name === name)
				line.style.display = muted.has(name) ? "none" : "";
		}
		for (const chip of rosterEl.querySelectorAll(".chat-user")) {
			if (chip.textContent === name) {
				chip.classList.toggle("muted", muted.has(name));
				chip.title = (muted.has(name) ? "Unmute " : "Mute ") + name;
			}
		}
	}

	function fmtTime(ts) {
		try {
			return new Date(ts || Date.now()).toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			});
		} catch {
			return "";
		}
	}

	function addLine(kind, name, text, ts) {
		const line = xel("div");
		line.className = "chat-line" + (kind === "system" ? " system" : "");
		if (kind === "system") {
			line.textContent = text;
		} else {
			line.dataset.name = name;
			if (muted.has(name)) line.style.display = "none";
			const who = xel("span");
			who.className = "chat-who";
			who.textContent = name;
			who.title = "Mute " + name;
			who.addEventListener("click", () => toggleMute(name));
			const body = xel("span");
			body.className = "chat-text";
			body.textContent = text;
			const time = xel("span");
			time.className = "chat-time";
			time.textContent = fmtTime(ts);
			line.append(who, body, time);
		}
		const atBottom =
			logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
		logEl.appendChild(line);
		if (atBottom) logEl.scrollTop = logEl.scrollHeight;
	}

	// ---- connection --------------------------------------------------------
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
		show("room");
		roomNameEl.textContent = target === "public" ? "Public lobby" : `#${target}`;
		logEl.textContent = "";
		if (rosterEl) rosterEl.textContent = "";
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
			} else if (d.type === "roster" && Array.isArray(d.users)) {
				renderRoster(d.users);
			}
		});
		ws.addEventListener("close", () => {
			if (!wantOpen) return;
			setStatus("reconnecting…");
			setTimeout(open, 1500);
		});
		ws.addEventListener("error", () => setStatus("connection error"));
	}

	function setStatus(s) {
		if (statusEl) statusEl.textContent = s;
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
		show("setup");
	}

	// ---- wiring ------------------------------------------------------------
	if (loginBtn) loginBtn.addEventListener("click", tryLogin);
	if (passEl)
		passEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				tryLogin();
			}
		});

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
		if (!roomView.hidden) return; // already in a room
		if (isAuthed()) {
			show("setup");
			if (nameEl) nameEl.focus();
		} else {
			show("login");
			if (passEl) passEl.focus();
		}
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
