import type { ErrorEvent, EventHint, init } from "@sentry/tanstackstart-react";

// Keep code locations useful for debugging, without URL credentials, query
// parameters, fragments, or local directory names.
function codeFilename(filename: string | undefined) {
	return filename?.split(/[?#]/, 1)[0]?.split(/[\\/]/).pop();
}

function isIncomingRequestDisconnect(event: ErrorEvent): boolean {
	if (event.platform !== "node") return false;

	// Match the transport's origin as well as the message. Outgoing fetches,
	// database connections, and application timeouts must still be reported.
	return (
		event.exception?.values?.every((exception) => {
			const frames = exception.stacktrace?.frames ?? [];
			if (exception.type === "Error" && exception.value === "aborted") {
				return frames.some(
					(frame) =>
						frame.filename === "node:_http_server" &&
						frame.function === "abortIncoming",
				);
			}
			if (
				!["AbortError", "Error"].includes(exception.type ?? "") ||
				exception.value !== "This operation was aborted"
			)
				return false;

			return frames.some(
				(frame) =>
					frame.function === "ServerResponse.onClose" &&
					(codeFilename(frame.filename) === "h3+rou3+srvx.mjs" ||
						frame.filename
							?.replaceAll("\\", "/")
							.endsWith("/srvx/dist/adapters/node.mjs")) &&
					frames.some(
						(origin) =>
							origin.function === "abort" && origin.filename === frame.filename,
					),
			);
		}) ?? false
	);
}

// What Chrome, Safari and Firefox each call a request whose response never
// arrived or was cut off partway. A response with an error status never
// produces these.
const BROWSER_TRANSPORT_FAILURE =
	/^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.)$/;

function isHandledBrowserTransportFailure(event: ErrorEvent): boolean {
	if (event.platform !== "javascript") return false;

	// The player's connection dropped and the caller already recovered. An
	// uncaught one is still reported, because it names a request with no
	// error path.
	return (
		event.exception?.values?.every(
			(exception) =>
				exception.type === "TypeError" &&
				exception.mechanism?.handled !== false &&
				BROWSER_TRANSPORT_FAILURE.test(exception.value ?? ""),
		) ?? false
	);
}

export function minimizeSentryEvent(
	event: ErrorEvent,
	hint: EventHint,
): ErrorEvent | null {
	hint.attachments = [];
	if (!event.exception?.values?.length) return null;
	// Inspect full paths and exception types before the privacy scrub below.
	// Keep an event if any exception in its cause chain is an actual failure.
	if (isIncomingRequestDisconnect(event)) return null;
	if (isHandledBrowserTransportFailure(event)) return null;

	// Keep exception messages for diagnosis, but allowlist the surrounding
	// metadata to exclude request data, personal context, and custom tags.
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
				value: exception.value,
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
