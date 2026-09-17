"use strict";
/**
 * Wisp backend endpoint.
 *
 * - Leave "" (empty) for LOCAL DEV (`npm start`): the frontend uses the
 *   same-origin  ws(s)://<this host>/wisp/  served by src/index.js.
 * - For the CLOUDFLARE SPLIT (frontend on Pages, Wisp on a Worker), set this to
 *   your deployed Worker, e.g.:
 *     window.WISP_URL = "wss://wisp-worker.<your-subdomain>.workers.dev/";
 *   The trailing slash matters.
 */
window.WISP_URL = "wss://wisp.zilkcz.com/";
