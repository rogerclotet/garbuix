import type { Event } from "@sentry/tanstackstart-react";

export function scrubGlitchTipEvent<T extends Event>(event: T): T {
	if (event.request) {
		delete event.request.cookies;
		delete event.request.data;
		delete event.request.query_string;
		if (event.request.url) {
			event.request.url = event.request.url.split(/[?#]/)[0];
		}
		// Authentication and proxy headers can carry cookies, tokens and IPs.
		delete event.request.headers;
	}
	return event;
}
