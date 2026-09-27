import {
	chromeStackLineParser,
	createStackParser,
	DOMExceptionCoercer,
	ErrorCoercer,
	ErrorPropertiesBuilder,
	type Exception,
	geckoStackLineParser,
	nodeStackLineParser,
	StringCoercer,
} from "@posthog/core/error-tracking";
import { z } from "zod";

const frameSchema = z.strictObject({
	platform: z.enum(["web:javascript", "node:javascript"]),
	filename: z.string().max(1000).optional(),
	function: z.string().max(200).optional(),
	lineno: z.number().int().nonnegative().optional(),
	colno: z.number().int().nonnegative().optional(),
	chunk_id: z.uuid().optional(),
});
const exceptionSchema = z.strictObject({
	type: z.string().max(128),
	value: z.string().max(1024),
	mechanism: z.strictObject({
		handled: z.boolean(),
		synthetic: z.boolean(),
	}),
	stacktrace: z.strictObject({
		type: z.literal("raw"),
		frames: z.array(frameSchema).max(30),
	}),
});
export const errorReportSchema = z.strictObject({
	exceptions: z.array(exceptionSchema).min(1).max(5),
	release: z.string().regex(/^garbuix@[\w.-]{1,100}$/),
});
export type ErrorReport = z.infer<typeof errorReportSchema>;
export type ErrorRuntime = "browser" | "server";

export function redactErrorText(value: string): string {
	return value
		.replace(/https?:\/\/[^\s)]+/gi, "[URL]")
		.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
		.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]")
		.replace(/\b[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\b/gi, "[ID]")
		.replace(/\b(?:ph[cpx]_\w+|Bearer\s+\S+|[\w-]{40,})/gi, "[token]")
		.replace(/(["'])[^\n]*?\1/g, "[value]")
		.replace(
			/\b(params|parameters|password|token|secret|authorization)\s*[:=].*/gi,
			"$1: [redacted]",
		);
}

function scrubFilename(filename: string | undefined) {
	if (!filename) return undefined;
	// Chunk IDs match uploaded maps; URLs, query strings and local home paths
	// are unnecessary for that lookup.
	return redactErrorText(
		filename
			.replace(/[?#].*$/, "")
			.replace(/^https?:\/\/[^/]+/i, "")
			.replace(/^(?:file:\/\/)?.*?\/(\.output|src|node_modules)\//, "$1/")
			.replace(/\/Users\/[^/]+|\/home\/[^/]+/g, "/[home]"),
	).slice(0, 1000);
}

function scrubException(
	exception: Exception,
	runtime: ErrorRuntime,
): ErrorReport["exceptions"][number] {
	return {
		type: redactErrorText(exception.type ?? "Error").slice(0, 128),
		value: redactErrorText(exception.value ?? "Unknown error").slice(0, 1024),
		mechanism: {
			handled: exception.mechanism?.handled ?? true,
			synthetic: exception.mechanism?.synthetic ?? false,
		},
		stacktrace: {
			type: "raw",
			frames: (exception.stacktrace?.frames ?? []).slice(-30).map((frame) => ({
				platform: runtime === "browser" ? "web:javascript" : "node:javascript",
				filename: scrubFilename(frame.filename),
				function: frame.function
					? redactErrorText(frame.function).slice(0, 200)
					: undefined,
				lineno: frame.lineno,
				colno: frame.colno,
				chunk_id: frame.chunk_id,
			})),
		},
	};
}

export function sanitizeErrorReport(
	report: ErrorReport,
	runtime: ErrorRuntime,
): ErrorReport {
	return {
		...report,
		exceptions: report.exceptions.map((exception) =>
			scrubException(exception, runtime),
		),
	};
}

export function buildErrorReport(
	error: unknown,
	runtime: ErrorRuntime,
	release: string,
	handled = true,
): ErrorReport {
	const parser =
		runtime === "browser"
			? createStackParser(
					"web:javascript",
					chromeStackLineParser,
					geckoStackLineParser,
				)
			: createStackParser("node:javascript", nodeStackLineParser);
	// Use PostHog's own exception/stack parser and injected chunk-ID lookup,
	// without initializing its analytics client or generating visitor state.
	const builder = new ErrorPropertiesBuilder(
		[new ErrorCoercer(), new DOMExceptionCoercer(), new StringCoercer()],
		parser,
	);
	const properties = builder.buildFromUnknown(error, {
		mechanism: { handled },
		syntheticException: new Error("Captured exception"),
	});
	return {
		release,
		exceptions: properties.$exception_list
			.slice(0, 5)
			.map((exception) => scrubException(exception, runtime)),
	};
}
