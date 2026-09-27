// Also initializes Vite's isolated development worker. Production preloads it
// before importing the app so database and HTTP libraries can be instrumented.
import "../instrument.server";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export default createServerEntry(
	wrapFetchWithSentry({
		fetch: (request) => handler.fetch(request),
	}),
);
