"use strict";
const stockSW = "./sw.js";

/**
 * List of hostnames that are allowed to run serviceworkers on http://
 */
const swAllowedHostnames = ["localhost", "127.0.0.1"];

/**
 * Global util
 * Used in 404.html and index.html
 */
async function registerSW() {
	if (!navigator.serviceWorker) {
		if (
			location.protocol !== "https:" &&
			!swAllowedHostnames.includes(location.hostname)
		)
			throw new Error("Service workers cannot be registered without https.");

		throw new Error("Your browser doesn't support service workers.");
	}

	await navigator.serviceWorker.register(stockSW);
	// register() resolves once the registration exists, not once the worker
	// controls this scope. Navigating before that leaves the first request
	// unintercepted, which reads as a blank frame. serviceWorker.ready waits for
	// control, but never rejects -- so bound it, or a worker that never activates
	// hangs the caller forever and looks like the very silent failure we are
	// trying to remove.
	await Promise.race([
		navigator.serviceWorker.ready,
		new Promise((_, reject) =>
			setTimeout(
				() => reject(new Error("Service worker did not activate in time.")),
				10000
			)
		),
	]);
}
