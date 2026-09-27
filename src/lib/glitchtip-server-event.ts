import type { Event, EventHint } from "@sentry/tanstackstart-react";
import { scrubGlitchTipEvent } from "./glitchtip-scrub.ts";

function isIncomingRequestAbort(error: unknown): boolean {
	const seen = new Set<Error>();
	while (error instanceof Error && !seen.has(error)) {
		seen.add(error);
		if (error.message !== "aborted") return false;
		// Node's incoming HTTP request emits this when the client disconnects.
		// The message/code alone also match upstream failures, so require the
		// server-side origin seen in the GlitchTip stacks.
		if (
			"code" in error &&
			error.code === "ECONNRESET" &&
			/\bat abortIncoming \(node:_http_server:\d+:\d+\)/.test(error.stack ?? "")
		) {
			return true;
		}
		// H3 wraps this error before logging it. Do not discard application
		// failures that happen to contain a disconnect further down their cause.
		if (error.name !== "HTTPError") return false;
		error = error.cause;
	}
	return false;
}

export function prepareGlitchTipServerEvent<T extends Event>(
	event: T,
	hint: EventHint,
): T | null {
	if (isIncomingRequestAbort(hint.originalException)) return null;
	return scrubGlitchTipEvent(event);
}
