import {
	captureBrowserException,
	configureBrowserErrorTracking,
} from "./lib/error-tracking-client";
import {
	ERROR_TRACKING_CONFIG_ID,
	errorTrackingClientConfigSchema,
} from "./lib/error-tracking-config";

try {
	const serialized = document.getElementById(
		ERROR_TRACKING_CONFIG_ID,
	)?.textContent;
	const config = errorTrackingClientConfigSchema.safeParse(
		serialized ? JSON.parse(serialized) : null,
	);
	if (config.success && config.data.enabled) {
		configureBrowserErrorTracking(true);
		window.addEventListener("error", (event) => {
			if (event.error) captureBrowserException(event.error, false);
		});
		window.addEventListener("unhandledrejection", (event) =>
			captureBrowserException(event.reason, false),
		);
	}
} catch {
	/* A missing or invalid public config leaves reporting disabled. */
}
