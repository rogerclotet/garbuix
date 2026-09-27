import * as Sentry from "@sentry/tanstackstart-react";

export function captureServerException(
	error: unknown,
	options?: {
		properties?: Record<string, unknown>;
	},
) {
	Sentry.captureException(error, { extra: options?.properties });
}

export async function observeServerAction<T>(
	name: string,
	action: () => Promise<T>,
	options?: {
		properties?: Record<string, unknown>;
	},
) {
	try {
		return await Sentry.startSpan({ name, op: "function" }, action);
	} catch (error) {
		captureServerException(error, {
			properties: { action: name, ...options?.properties },
		});
		throw error;
	}
}
