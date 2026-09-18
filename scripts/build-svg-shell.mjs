// Generates app/ (the CDN-hosted shell) from public/ (the source of truth).
//
// public/ and app/ are the same UI served two ways: public/ as an ordinary HTML
// page behind the Cloudflare Worker, app/ as an SVG document served straight off
// a CDN. They were maintained as two hand-edited copies and drifted apart, so
// this script makes public/ authoritative and derives app/ from it.
//
// The SVG shell is an XML document, so the markup needs XHTML rules: numeric
// entities only, boolean attributes spelled out, and an explicit namespace on
// every nested <svg>. Run: npm run build:svg

import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = `${root}public`;
const out = `${root}app`;

// Files that are byte-identical in both builds. Kept as plain copies so a
// `diff public/<f> app/<f>` stays empty and drift is trivial to spot.
const SHARED = [
	"index.css",
	"favicon.svg",
	"search.js",
	"wisp-config.js",
	"register-sw.js",
	"games.js",
	"bg.js",
	"credits.html",
	"fonts/comfortaa.woff2",
];

// XML predefines only &amp; &lt; &gt; &quot; &apos; -- every other named entity
// is a parse error in an SVG document, so map the ones we use to numeric form.
const ENTITIES = {
	"&times;": "&#215;",
	"&lsaquo;": "&#8249;",
	"&rsaquo;": "&#8250;",
	"&nbsp;": "&#160;",
	"&mdash;": "&#8212;",
	"&ndash;": "&#8211;",
	"&hellip;": "&#8230;",
	"&copy;": "&#169;",
};
const KEEP = new Set(["&amp;", "&lt;", "&gt;", "&quot;", "&apos;"]);

const SVG_STYLE = `			<style>/*<![CDATA[*/
				html, body { width: 100%; height: 100%; }
				foreignObject { overflow: visible; }
				#sj-frame { position: fixed; inset: 0; width: 100vw; height: 100vh; border: 0; background: #0b0817; z-index: 100; }

				/* The aurora canvas (#bg) sits at z-index:-1. In an HTML document the
				   body background propagates to the viewport and is painted BEFORE
				   negative z-index children, so the canvas shows through it. Inside
				   <foreignObject> the <html> element is not the document root, so that
				   background paints as an ordinary block background -- which comes
				   AFTER negative z-index children in the painting order and buries the
				   aurora. Paint the base gradient on the svg root instead (:root, the
				   stacking context, painted first) and leave html/body transparent. */
				:root {
					background:
						radial-gradient(1100px 620px at 12% -12%, rgba(100, 149, 237, 0.22), transparent 60%),
						radial-gradient(1000px 720px at 92% 112%, rgba(124, 58, 237, 0.28), transparent 62%),
						linear-gradient(158deg, #140d2c 0%, #180f31 44%, #0b0817 100%);
					background-attachment: fixed;
				}
				html, body { background: transparent; }
			/*]]>*/</style>`;

// Visible only when no script ran at all, so a blocked or half-loaded shell
// says so instead of rendering normally and sitting inert.
const BOOT_WARN = `			<div id="boot-warn" style="position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;background:#0b0817;color:#e9e4ff;font:16px/1.6 system-ui,sans-serif;text-align:center">
				<div>
					<strong style="display:block;font-size:20px;margin-bottom:8px">Vector couldn&#8217;t start</strong>
					<span id="boot-detail">The page&#8217;s scripts did not run.</span><br />
					<span style="opacity:0.7;font-size:14px">If this is a CDN, try a URL pinned to a commit rather than a branch &#8212; a half-updated cache serves a new page with old scripts.</span>
				</div>
			</div>`;

const BOOT_PROBE = `			<script>/*<![CDATA[*/
				window.__vfail = [];
				window.__vnote = function (s) { window.__vfail.push(s); };
			/*]]>*/</script>`;

// Runs after every other script. If the banner is still up, app.js never ran,
// so say which files failed to load rather than guessing at the cause.
const BOOT_REPORT = `			<script>/*<![CDATA[*/
				(function () {
					var fo = document.querySelector("foreignObject");
					var root = fo ? fo.firstElementChild : document;
					var warn = root && root.querySelector('[id="boot-warn"]');
					if (!warn || warn.style.display === "none") return;
					var detail = root.querySelector('[id="boot-detail"]');
					if (!detail) return;
					var failed = window.__vfail || [];
					detail.textContent = failed.length
						? "These files did not load: " + failed.join(", ")
						: "Scripts loaded but app.js did not start it. Check the console for an error.";
				})();
			/*]]>*/</script>`;

// Engine and app scripts, in dependency order. The CDN build resolves the
// vendored engine relative to the document rather than hardcoding a CDN host.
const SCRIPTS = [
	"../cdn/scram/scramjet.all.js",
	"../cdn/baremux/index.js",
	"wisp-config.js",
	"register-sw.js",
	"search.js",
	"app.js",
	"bg.js",
	"games.js",
];

function toXhtml(html) {
	let s = html;

	// 1. doctype has no place in an XML document
	s = s.replace(/<!doctype html>\s*/i, "");

	// 2. named entities -> numeric, and fail loudly on any we do not know about
	for (const [named, numeric] of Object.entries(ENTITIES)) {
		s = s.split(named).join(numeric);
	}
	for (const m of s.match(/&[a-zA-Z][a-zA-Z0-9]*;/g) || []) {
		if (!KEEP.has(m)) {
			throw new Error(
				`Unmapped named entity ${m} -- XML only predefines five. Add it to ENTITIES.`
			);
		}
	}

	// 3. boolean attributes need a value in XML
	s = s.replace(/\shidden(?=[\s>])/g, ' hidden="hidden"');
	s = s.replace(/\sdownload(?=[\s>])/g, ' download="download"');

	// 4. a nested <svg> inherits the XHTML namespace unless it declares its own
	s = s.replace(
		/<svg(?![^>]*xmlns=)/g,
		'<svg xmlns="http://www.w3.org/2000/svg"'
	);

	return s;
}

function build() {
	const html = readFileSync(`${src}/index.html`, "utf8");

	// Split the source page into head and body; the head is rebuilt (different
	// scripts, extra style) while the body is transformed as-is.
	const headInner = html.match(/<head>([\s\S]*?)<\/head>/)[1];
	const bodyInner = html.match(/<body>([\s\S]*?)<\/body>/)[1];

	// Keep the head's metadata, drop its <script> and stylesheet wiring.
	const meta = headInner
		.replace(/<script[\s\S]*?<\/script>\s*/g, "")
		.replace(/<link rel="stylesheet"[^>]*>\s*/g, "")
		.trim();

	const head = [
		BOOT_PROBE,
		`			<script src="dom-shim.js" onerror="__vnote('dom-shim.js')"></script>`,
		"",
		"			" + toXhtml(meta).split("\n").join("\n"),
		'			<link rel="stylesheet" href="index.css" />',
		SVG_STYLE,
	].join("\n");

	const scripts = SCRIPTS.map(
		(s) =>
			`			<script src="${s}" onerror="__vnote('${s.split("/").pop()}')"></script>`
	).join("\n");

	const body = [
		BOOT_WARN,
		toXhtml(bodyInner).trimEnd(),
		scripts,
		BOOT_REPORT,
	].join("\n");

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
	<foreignObject width="100%" height="100%">
		<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
			<head>
${head}
			</head>

			<body>
${body}
			</body>
		</html>
	</foreignObject>
</svg>
`;

	writeFileSync(`${out}/index.svg`, svg);
	console.log("Wrote app/index.svg  (SVG shell, for CDNs that refuse HTML)");

	// Plain-HTML shell for the same CDN path. Hosts differ: jsDelivr forces
	// text/plain on HTML, which is the only reason the SVG wrapper exists, but
	// other CDNs serve HTML normally and may sanitize or refuse scripts inside
	// an SVG. Ship both and point the URL at whichever the host actually runs.
	//
	// This one needs no dom-shim: in a real HTML document createElement already
	// builds HTML nodes, and the xel() fallback in app.js/games.js/bg.js works
	// unchanged. Same scripts, same relative engine paths, no XHTML conversion.
	const htmlScripts = SCRIPTS.map(
		(f) =>
			`\t\t<script src="${f}" onerror="__vnote('${f.split("/").pop()}')"></script>`
	).join("\n");

	const forHtml = (block) =>
		block.replace(/\/\*<!\[CDATA\[\*\//g, "").replace(/\/\*\]\]>\*\//g, "");

	const shell = `<!doctype html>
<html lang="en">
	<head>
${forHtml(BOOT_PROBE).replace(/^\t{3}/gm, "\t\t")}
${meta.replace(/^\t{2}/gm, "\t\t")}
		<link rel="stylesheet" href="index.css" />
	</head>

	<body>
${BOOT_WARN.replace(/^\t{3}/gm, "\t\t")}
${bodyInner.trimEnd()}
${htmlScripts}
${forHtml(BOOT_REPORT).replace(/^\t{3}/gm, "\t\t")}
	</body>
</html>
`;
	writeFileSync(`${out}/index.html`, shell);
	console.log("Wrote app/index.html (HTML shell, for CDNs that serve HTML)");

	mkdirSync(`${out}/fonts`, { recursive: true });
	for (const f of SHARED) {
		copyFileSync(`${src}/${f}`, `${out}/${f}`);
	}
	console.log(`Copied ${SHARED.length} shared files public/ -> app/`);
	console.log("Left app-specific: app.js, sw.js, dom-shim.js, games.json");
}

build();
