"use strict";

/* Aurora background: flowing violet/cornflower light curtains + glowing
 * particles that stream across and repel from the cursor.
 * Optimized for low-end hardware: no per-frame blur filter, 1x canvas
 * resolution, and pre-baked glow sprites. Pauses when the tab is hidden. */
(function () {
	const xel =
		window.xel ||
		((t) => document.createElementNS("http://www.w3.org/1999/xhtml", t));

	const canvas = document.getElementById("bg");
	if (!canvas) return;
	const ctx = canvas.getContext("2d");

	let W, H, ribbons, parts, raf, running = true;
	const pointer = { x: 0, y: 0, active: false };

	const AUR = [
		[124, 58, 237],
		[139, 92, 246],
		[100, 149, 237],
		[143, 180, 245],
		[167, 139, 250],
	];

	// Pre-bake a soft radial glow sprite per colour (drawn with drawImage — far
	// cheaper than building a gradient every frame).
	const SPRITE = 64;
	const glows = AUR.map((rgb) => {
		const c = xel("canvas");
		c.width = c.height = SPRITE;
		const g = c.getContext("2d");
		const grad = g.createRadialGradient(
			SPRITE / 2,
			SPRITE / 2,
			0,
			SPRITE / 2,
			SPRITE / 2,
			SPRITE / 2
		);
		grad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`);
		grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
		g.fillStyle = grad;
		g.fillRect(0, 0, SPRITE, SPRITE);
		return c;
	});

	function resize() {
		// Render at CSS-pixel resolution (1x). The visuals are soft glows, so
		// there's no visible quality loss and it's ~4x cheaper on hi-dpi screens.
		W = canvas.width = innerWidth;
		H = canvas.height = innerHeight;
		canvas.style.width = innerWidth + "px";
		canvas.style.height = innerHeight + "px";
	}

	function build() {
		ribbons = [];
		const bands = [0.16, 0.34, 0.52, 0.72];
		for (let i = 0; i < bands.length; i++) {
			ribbons.push({
				c: AUR[i % AUR.length],
				by: bands[i],
				th: (0.12 + Math.random() * 0.12) * H,
				a1: (0.05 + Math.random() * 0.05) * H,
				a2: (0.02 + Math.random() * 0.03) * H,
				f1: (0.6 + Math.random() * 0.5) / 100,
				f2: (1.4 + Math.random() * 0.8) / 100,
				s1: 0.0024 + Math.random() * 0.0014,
				s2: 0.003 + Math.random() * 0.0016,
				p: Math.random() * Math.PI * 2,
				alpha: 0.16 + Math.random() * 0.1,
			});
		}

		const count = Math.max(
			22,
			Math.min(40, Math.round((innerWidth * innerHeight) / 42000))
		);
		parts = [];
		for (let i = 0; i < count; i++) {
			const bvx = 1.6 + Math.random() * 1.8; // flow across the screen
			const bvy = (Math.random() - 0.5) * 0.4;
			const x0 = Math.random() * W,
				y0 = Math.random() * H;
			parts.push({
				x: x0,
				y: y0,
				vx: bvx,
				vy: bvy,
				bvx,
				bvy,
				r: 4 + Math.random() * 7, // glow radius
				ci: (Math.random() * AUR.length) | 0,
				a: 0.5 + Math.random() * 0.4,
			});
		}
	}

	function drawRibbon(rb, t) {
		const yBase = rb.by * H;
		const step = Math.max(14, W / 90);
		ctx.beginPath();
		for (let x = 0; x <= W + step; x += step) {
			const y =
				yBase +
				Math.sin(x * rb.f1 - t * rb.s1 + rb.p) * rb.a1 +
				Math.sin(x * rb.f2 - t * rb.s2) * rb.a2;
			if (x === 0) ctx.moveTo(0, y);
			else ctx.lineTo(x, y);
		}
		for (let x = W + step; x >= 0; x -= step) {
			const y =
				yBase +
				rb.th +
				Math.sin(x * rb.f1 - t * rb.s1 + rb.p) * rb.a1 * 0.7 +
				Math.sin(x * rb.f2 - t * rb.s2) * rb.a2 * 0.7;
			ctx.lineTo(x, y);
		}
		ctx.closePath();
		const [r, g, b] = rb.c;
		const grad = ctx.createLinearGradient(
			0,
			yBase - rb.a1,
			0,
			yBase + rb.th + rb.a1
		);
		grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
		grad.addColorStop(0.5, `rgba(${r},${g},${b},${rb.alpha})`);
		grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
		ctx.fillStyle = grad;
		ctx.fill();
	}

	function frame(t) {
		ctx.clearRect(0, 0, W, H);
		ctx.globalCompositeOperation = "lighter";

		for (const rb of ribbons) drawRibbon(rb, t);

		const R = 200;
		ctx.lineCap = "round";
		for (const p of parts) {
			if (pointer.active) {
				const dx = p.x - pointer.x,
					dy = p.y - pointer.y;
				const d2 = dx * dx + dy * dy;
				if (d2 < R * R) {
					const d = Math.sqrt(d2) || 1;
					const f = 1 - d / R;
					const push = f * 2.6;
					const swirl = f * 1.3;
					p.vx += (dx / d) * push - (dy / d) * swirl;
					p.vy += (dy / d) * push + (dx / d) * swirl;
				}
			}
			p.vx = p.vx * 0.92 + p.bvx * 0.08;
			p.vy = p.vy * 0.92 + p.bvy * 0.08;

			const ox = p.x,
				oy = p.y;
			p.x += p.vx;
			p.y += p.vy;
			let wrapped = false;
			if (p.x < -30) ((p.x = W + 30), (wrapped = true));
			else if (p.x > W + 30) ((p.x = -30), (wrapped = true));
			if (p.y < -30) ((p.y = H + 30), (wrapped = true));
			else if (p.y > H + 30) ((p.y = -30), (wrapped = true));

			// motion streak (cheap) — makes the flow obvious
			if (!wrapped) {
				const rgb = AUR[p.ci];
				ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${p.a * 0.5})`;
				ctx.lineWidth = p.r * 0.5;
				ctx.beginPath();
				ctx.moveTo(ox, oy);
				ctx.lineTo(p.x, p.y);
				ctx.stroke();
			}
			// glowing head via pre-baked sprite
			const size = p.r * 4;
			ctx.globalAlpha = p.a;
			ctx.drawImage(glows[p.ci], p.x - size / 2, p.y - size / 2, size, size);
			ctx.globalAlpha = 1;
		}

		ctx.globalCompositeOperation = "source-over";
		if (running) raf = requestAnimationFrame(frame);
	}

	function start() {
		resize();
		build();
		raf = requestAnimationFrame(frame);
	}

	let rt;
	window.addEventListener("resize", () => {
		clearTimeout(rt);
		rt = setTimeout(() => {
			resize();
			build();
		}, 200);
	});

	window.addEventListener(
		"pointermove",
		(e) => {
			pointer.x = e.clientX;
			pointer.y = e.clientY;
			pointer.active = true;
		},
		{ passive: true }
	);
	window.addEventListener("pointerout", () => (pointer.active = false));
	window.addEventListener("blur", () => (pointer.active = false));

	document.addEventListener("visibilitychange", () => {
		running = !document.hidden;
		cancelAnimationFrame(raf);
		if (running) raf = requestAnimationFrame(frame);
	});

	start();
})();
