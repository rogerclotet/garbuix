import { APP_VERSION } from "./app-version";
import { buildErrorReport } from "./error-report";
import { ERROR_TRACKING_PATH } from "./error-tracking-config";

let enabled = false;
const captured = new WeakSet<object>();
let sent = 0;
let windowStarted = 0;

export function configureBrowserErrorTracking(value: boolean) {
	enabled = value;
}

export function captureBrowserException(error: unknown, handled = true) {
	if (!enabled) return;
	if (typeof error === "object" && error !== null) {
		if (captured.has(error)) return;
		captured.add(error);
	}
	// Bound a broken page's traffic without persistent state or player IDs.
	if (Date.now() - windowStarted > 60_000) {
		windowStarted = Date.now();
		sent = 0;
	}
	if (sent++ >= 10) return;
	try {
		const report = buildErrorReport(
			error,
			"browser",
			`garbuix@${APP_VERSION}`,
			handled,
		);
		void fetch(ERROR_TRACKING_PATH, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(report),
			credentials: "omit",
			referrerPolicy: "no-referrer",
			cache: "no-store",
			keepalive: true,
		}).catch(() => {});
	} catch {
		// An error reporter must never create another application error.
	}
}
