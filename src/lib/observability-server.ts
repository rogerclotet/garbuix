import { getErrorReporter } from "./error-tracking.server";

export function captureServerException(
	error: unknown,
	options?: {
		properties?: Record<string, unknown>;
	},
) {
	// Additional context from callers is deliberately not sent to PostHog.
	void options;
	getErrorReporter()?.capture(error);
}

export async function observeServerAction<T>(
	name: string,
	action: () => Promise<T>,
	options?: {
		properties?: Record<string, unknown>;
	},
) {
	try {
		return await action();
	} catch (error) {
		captureServerException(error, {
			properties: { action: name, ...options?.properties },
		});
		throw error;
	}
}
