"use strict";

/* Animated aurora background: soft drifting orbs of violet + cornflower that
 * blend additively. Pauses when the tab is hidden and respects reduced-motion. */
(function () {
	const canvas = document.getElementById("bg");
	if (!canvas) return;
	const ctx = canvas.getContext("2d");
	const reduce =
		window.matchMedia &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	const COLORS = [
		[139, 92, 246], // violet
		[124, 58, 237], // deep violet
		[167, 139, 250], // soft violet
		[100, 149, 237], // cornflower
		[143, 180, 245], // light cornflower
	];

	let W, H, DPR, orbs, raf, running = true;

	function resize() {
		DPR = Math.min(window.devicePixelRatio || 1, 2);
		W = canvas.width = Math.floor(innerWidth * DPR);
		H = canvas.height = Math.floor(innerHeight * DPR);
		canvas.style.width = innerWidth + "px";
		canvas.style.height = innerHeight + "px";
	}

	function makeOrbs() {
		const count = Math.max(
			7,
			Math.min(14, Math.round((innerWidth * innerHeight) / 90000))
		);
		orbs = [];
		for (let i = 0; i < count; i++) {
			const c = COLORS[(Math.random() * COLORS.length) | 0];
			const r = (150 + Math.random() * 230) * DPR;
			orbs.push({
				x: Math.random() * W,
				y: Math.random() * H,
				r,
				c,
				vx: (Math.random() - 0.5) * 0.32 * DPR,
				vy: (Math.random() - 0.5) * 0.32 * DPR,
				phase: Math.random() * Math.PI * 2,
				pulse: 0.0007 + Math.random() * 0.0012,
				alpha: 0.24 + Math.random() * 0.2,
			});
		}
	}

	function frame(t) {
		ctx.clearRect(0, 0, W, H);
		ctx.globalCompositeOperation = "lighter";
		for (const o of orbs) {
			o.x += o.vx;
			o.y += o.vy;
			if (o.x < -o.r) o.x = W + o.r;
			else if (o.x > W + o.r) o.x = -o.r;
			if (o.y < -o.r) o.y = H + o.r;
			else if (o.y > H + o.r) o.y = -o.r;

			const pr = o.r * (0.85 + 0.15 * Math.sin(t * o.pulse + o.phase));
			const [r, g, b] = o.c;
			const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, pr);
			grad.addColorStop(0, `rgba(${r},${g},${b},${o.alpha})`);
			grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
			ctx.fillStyle = grad;
			ctx.beginPath();
			ctx.arc(o.x, o.y, pr, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalCompositeOperation = "source-over";
		if (running && !reduce) raf = requestAnimationFrame(frame);
	}

	function start() {
		resize();
		makeOrbs();
		frame(0);
	}

	window.addEventListener("resize", () => {
		resize();
		makeOrbs();
		if (reduce) frame(0);
	});

	document.addEventListener("visibilitychange", () => {
		running = !document.hidden;
		if (running && !reduce) {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(frame);
		} else {
			cancelAnimationFrame(raf);
		}
	});

	start();
})();
