// Initializes both Vite's worker and the production server. The reporter is
// shared with the Node preload, which also covers maintenance scripts.
import "../instrument.server";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { getErrorReporter } from "./lib/error-tracking.server";

export default createServerEntry({
	async fetch(request) {
		const reporter = getErrorReporter();
		const run = async () => {
			try {
				return await handler.fetch(request);
			} catch (error) {
				reporter?.capture(error, false);
				throw error;
			}
		};
		return reporter ? reporter.withRequest(request.url, run) : run();
	},
});
