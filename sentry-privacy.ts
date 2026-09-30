import type { ErrorEvent, EventHint, init } from "@sentry/tanstackstart-react";

// Keep code locations useful for debugging, without URL credentials, query
// parameters, fragments, or local directory names.
function codeFilename(filename: string | undefined) {
	return filename?.split(/[?#]/, 1)[0]?.split(/[\\/]/).pop();
}

export function minimizeSentryEvent(
	event: ErrorEvent,
	hint: EventHint,
): ErrorEvent | null {
	hint.attachments = [];
	if (!event.exception?.values?.length) return null;

	// Build an allowlist instead of trying to recognize personal data in every
	// possible error message, request, context, attachment, or custom tag.
	return {
		type: undefined,
		event_id: event.event_id,
		timestamp: event.timestamp,
		platform: event.platform,
		level: event.level,
		release: event.release,
		environment: event.environment,
		sdk: event.sdk,
		exception: {
			values: event.exception.values.map((exception) => ({
				type: /^(Error|TypeError|RangeError|ReferenceError|SyntaxError|URIError|EvalError|AggregateError)$/.test(
					exception.type ?? "",
				)
					? exception.type
					: "Error",
				value: "Error details omitted for privacy",
				// Alert rules need this boolean, but mechanism data can contain PII.
				mechanism: exception.mechanism
					? { type: "generic", handled: exception.mechanism.handled }
					: undefined,
				stacktrace: exception.stacktrace
					? {
							frames: exception.stacktrace.frames?.map((frame) => ({
								filename: codeFilename(frame.filename),
								function: frame.function,
								lineno: frame.lineno,
								colno: frame.colno,
								in_app: frame.in_app,
							})),
						}
					: undefined,
			})),
		},
		debug_meta: event.debug_meta
			? {
					images: event.debug_meta.images
						?.filter((image) => image.type === "sourcemap")
						.map((image) => ({
							type: image.type,
							debug_id: image.debug_id,
							code_file: codeFilename(image.code_file) ?? "unknown",
						})),
				}
			: undefined,
	};
}

export const sentryPrivacyOptions = {
	dataCollection: {
		userInfo: false,
		cookies: false,
		httpHeaders: false,
		httpBodies: [],
		urlQueryParams: false,
		graphQL: { document: false, variables: false },
		genAI: { inputs: false, outputs: false },
		databaseQueryData: false,
		queues: false,
		stackFrameVariables: false,
		frameContextLines: 0,
	},
	maxBreadcrumbs: 0,
	integrations: (defaults) =>
		defaults.filter(
			(integration) =>
				![
					"BrowserSession",
					"ProcessSession",
					"Breadcrumbs",
					"Console",
				].includes(integration.name),
		),
	sendClientReports: false,
	beforeSend: minimizeSentryEvent,
	beforeSendLog: () => null,
	beforeSendMetric: () => null,
} satisfies NonNullable<Parameters<typeof init>[0]>;
