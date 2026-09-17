"use strict";

/* Aurora background: flowing wavy light curtains (aurora borealis) in violet +
 * cornflower, plus glowing particles that repel from the cursor. Pauses when the
 * tab is hidden and honors prefers-reduced-motion. */
(function () {
	const canvas = document.getElementById("bg");
	if (!canvas) return;
	const ctx = canvas.getContext("2d");

	let W, H, DPR, ribbons, parts, raf, running = true;
	const pointer = { x: 0, y: 0, active: false };

	// Aurora curtain colors (r,g,b)
	const AUR = [
		[124, 58, 237], // deep violet
		[139, 92, 246], // violet
		[100, 149, 237], // cornflower
		[143, 180, 245], // light cornflower
		[167, 139, 250], // soft violet
	];

	function resize() {
		DPR = Math.min(window.devicePixelRatio || 1, 2);
		W = canvas.width = Math.floor(innerWidth * DPR);
		H = canvas.height = Math.floor(innerHeight * DPR);
		canvas.style.width = innerWidth + "px";
		canvas.style.height = innerHeight + "px";
	}

	function build() {
		// Curtains spread down the view, each undulating on its own phases.
		ribbons = [];
		const bands = [0.16, 0.3, 0.44, 0.6, 0.76];
		for (let i = 0; i < bands.length; i++) {
			const c = AUR[i % AUR.length];
			ribbons.push({
				c,
				by: bands[i],
				th: 0.1 + Math.random() * 0.12, // thickness (fraction of H)
				a1: 0.05 + Math.random() * 0.05, // wave amplitude 1
				a2: 0.02 + Math.random() * 0.03, // wave amplitude 2
				f1: (0.6 + Math.random() * 0.5) / (100 * DPR),
				f2: (1.4 + Math.random() * 0.8) / (100 * DPR),
				s1: 0.0024 + Math.random() * 0.0014,
				s2: 0.003 + Math.random() * 0.0016,
				p: Math.random() * Math.PI * 2,
				alpha: 0.16 + Math.random() * 0.1,
			});
		}

		// Glowing drifting particles (interactive).
		const count = Math.max(
			28,
			Math.min(60, Math.round((innerWidth * innerHeight) / 26000))
		);
		parts = [];
		for (let i = 0; i < count; i++) {
			const c = AUR[(Math.random() * AUR.length) | 0];
			// Fast coherent flow across the screen (rightward), varying speeds.
			const bvx = (2.6 + Math.random() * 2.8) * DPR;
			const bvy = (Math.random() - 0.5) * 0.6 * DPR;
			const x0 = Math.random() * W,
				y0 = Math.random() * H;
			parts.push({
				x: x0,
				y: y0,
				px: x0,
				py: y0,
				vx: bvx,
				vy: bvy,
				bvx,
				bvy,
				r: (2 + Math.random() * 3.5) * DPR,
				c,
				a: 0.5 + Math.random() * 0.4,
			});
		}
	}

	function drawRibbon(rb, t) {
		const yBase = rb.by * H;
		const amp1 = rb.a1 * H,
			amp2 = rb.a2 * H,
			th = rb.th * H;
		const step = Math.max(10 * DPR, W / 140);
		ctx.beginPath();
		for (let x = 0; x <= W + step; x += step) {
			const y =
				yBase +
				Math.sin(x * rb.f1 - t * rb.s1 + rb.p) * amp1 +
				Math.sin(x * rb.f2 - t * rb.s2) * amp2;
			if (x === 0) ctx.moveTo(0, y);
			else ctx.lineTo(x, y);
		}
		for (let x = W + step; x >= 0; x -= step) {
			const y =
				yBase +
				th +
				Math.sin(x * rb.f1 - t * rb.s1 + rb.p) * amp1 * 0.7 +
				Math.sin(x * rb.f2 - t * rb.s2) * amp2 * 0.7;
			ctx.lineTo(x, y);
		}
		ctx.closePath();
		const [r, g, b] = rb.c;
		const grad = ctx.createLinearGradient(
			0,
			yBase - amp1,
			0,
			yBase + th + amp1
		);
		grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
		grad.addColorStop(0.5, `rgba(${r},${g},${b},${rb.alpha})`);
		grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
		ctx.fillStyle = grad;
		ctx.fill();
	}

	function frame(t) {
		ctx.clearRect(0, 0, W, H);

		// Aurora curtains — softened + additive for a glowing light feel.
		ctx.globalCompositeOperation = "lighter";
		ctx.filter = `blur(${10 * DPR}px)`;
		for (const rb of ribbons) drawRibbon(rb, t);
		ctx.filter = "none";

		// Interactive glowing particles.
		const R = 240 * DPR;
		ctx.lineCap = "round";
		for (const p of parts) {
			if (pointer.active) {
				const dx = p.x - pointer.x,
					dy = p.y - pointer.y;
				const d2 = dx * dx + dy * dy;
				if (d2 < R * R) {
					const d = Math.sqrt(d2) || 1;
					const f = 1 - d / R;
					const push = f * 3.4; // radial repulsion
					const swirl = f * 1.6; // tangential wake
					p.vx += (dx / d) * push - (dy / d) * swirl;
					p.vy += (dy / d) * push + (dx / d) * swirl;
				}
			}
			// ease back toward the flow
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

			const [r, g, b] = p.c;
			// motion streak (trail) — makes the flow clearly visible
			if (!wrapped) {
				ctx.strokeStyle = `rgba(${r},${g},${b},${p.a * 0.55})`;
				ctx.lineWidth = p.r * 1.5;
				ctx.beginPath();
				ctx.moveTo(ox, oy);
				ctx.lineTo(p.x, p.y);
				ctx.stroke();
			}
			// glowing head
			const glow = p.r * 4;
			const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
			grad.addColorStop(0, `rgba(${r},${g},${b},${p.a})`);
			grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
			ctx.fillStyle = grad;
			ctx.beginPath();
			ctx.arc(p.x, p.y, glow, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalCompositeOperation = "source-over";

		if (running) raf = requestAnimationFrame(frame);
	}

	function start() {
		resize();
		build();
		frame(0);
	}

	window.addEventListener("resize", () => {
		resize();
		build();
	});

	window.addEventListener(
		"pointermove",
		(e) => {
			pointer.x = e.clientX * DPR;
			pointer.y = e.clientY * DPR;
			pointer.active = true;
		},
		{ passive: true }
	);
	window.addEventListener("pointerout", () => (pointer.active = false));
	window.addEventListener("blur", () => (pointer.active = false));

	document.addEventListener("visibilitychange", () => {
		running = !document.hidden;
		if (running) {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(frame);
		} else {
			cancelAnimationFrame(raf);
		}
	});

	start();
})();
