import type { Event } from "@sentry/tanstackstart-react";
import { isUsageTelemetryUrl } from "./telemetry-privacy.ts";

export function scrubGlitchTipEvent<T extends Event>(event: T): T | null {
	if (
		isUsageTelemetryUrl(event.request?.url) ||
		isUsageTelemetryUrl(event.transaction)
	)
		return null;
	delete event.user;
	if (event.breadcrumbs) {
		event.breadcrumbs = event.breadcrumbs.filter(
			(breadcrumb) => !isUsageTelemetryUrl(breadcrumb.data?.url),
		);
	}
	if (event.spans) {
		event.spans = event.spans.filter(
			(span) =>
				!isUsageTelemetryUrl(span.data?.["url.full"]) &&
				!isUsageTelemetryUrl(span.data?.["http.url"]) &&
				!span.description?.includes("/api/usage") &&
				!span.description?.includes("/ph/"),
		);
	}
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
