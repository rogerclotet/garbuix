import * as Sentry from "@sentry/tanstackstart-react";
import { expect, it } from "vitest";
import {
	minimizeSentryEvent,
	sentryPrivacyOptions,
} from "../../sentry-privacy";

const responseAbort = {
	type: "AbortError",
	value: "This operation was aborted",
	stacktrace: {
		frames: [
			{ filename: "node:_http_server", function: "emitCloseNT" },
			{
				filename: "/app/.output/server/chunks/h3+rou3+srvx.mjs",
				function: "ServerResponse.onClose",
			},
			{
				filename: "/app/.output/server/chunks/h3+rou3+srvx.mjs",
				function: "abort",
			},
			{
				filename: "node:internal/abort_controller",
				function: "AbortController.abort",
			},
		],
	},
};

const incomingAbort = {
	type: "Error",
	value: "aborted",
	stacktrace: {
		frames: [
			{ filename: "node:_http_server", function: "socketOnClose" },
			{ filename: "node:_http_server", function: "abortIncoming" },
		],
	},
};

it.each([
	responseAbort,
	{ ...responseAbort, type: "Error" },
	incomingAbort,
	{
		...responseAbort,
		stacktrace: {
			frames: responseAbort.stacktrace.frames.map((frame) => ({
				...frame,
				filename: frame.filename.endsWith("h3+rou3+srvx.mjs")
					? "file:///app/node_modules/.pnpm/srvx@1.0.5/node_modules/srvx/dist/adapters/node.mjs"
					: frame.filename,
			})),
		},
	},
])("drops the production disconnect signature: $value", (exception) => {
	expect(
		minimizeSentryEvent(
			{ type: undefined, platform: "node", exception: { values: [exception] } },
			{},
		),
	).toBeNull();
});

it.each([
	{ ...responseAbort, stacktrace: undefined },
	{ ...incomingAbort, stacktrace: undefined },
	{ ...responseAbort, type: "TimeoutError", value: "The operation timed out" },
	{ ...incomingAbort, value: "socket hang up" },
	{
		...incomingAbort,
		stacktrace: {
			frames: [{ filename: "node:_http_client", function: "socketOnClose" }],
		},
	},
	{
		...responseAbort,
		stacktrace: {
			frames: [{ filename: "app.ts", function: "ServerResponse.onClose" }],
		},
	},
])(
	"keeps errors without a known incoming disconnect signature",
	(exception) => {
		expect(
			minimizeSentryEvent(
				{
					type: undefined,
					platform: "node",
					exception: { values: [exception] },
				},
				{},
			),
		).not.toBeNull();
	},
);

it("keeps browser aborts and failures that wrap a disconnect", () => {
	expect(
		minimizeSentryEvent(
			{
				type: undefined,
				platform: "javascript",
				exception: { values: [responseAbort] },
			},
			{},
		),
	).not.toBeNull();
	expect(
		minimizeSentryEvent(
			{
				type: undefined,
				platform: "node",
				exception: {
					values: [incomingAbort, { type: "Error", value: "Save failed" }],
				},
			},
			{},
		),
	).not.toBeNull();
});

it("filters disconnects before privacy scrubbing in real SDK envelopes", async () => {
	const envelopes: unknown[] = [];
	const client = Sentry.init({
		...sentryPrivacyOptions,
		dsn: "https://public@example.com/1",
		defaultIntegrations: false,
		transport: () => ({
			send: async (envelope: unknown) => {
				envelopes.push(envelope);
				return { statusCode: 200 };
			},
			flush: async () => true,
		}),
	});
	try {
		for (const exception of [responseAbort, incomingAbort]) {
			const error = new Error(exception.value);
			error.name = exception.type;
			error.stack = `${error.name}: ${error.message}\n${exception.stacktrace.frames
				.slice()
				.reverse()
				.map((frame) => `    at ${frame.function} (${frame.filename}:10:20)`)
				.join("\n")}`;
			Sentry.captureException(error);
		}
		Sentry.captureException(new Error("Database unavailable"));
		Sentry.captureException(
			new DOMException("This operation was aborted", "AbortError"),
		);
		await Sentry.flush();
		expect(envelopes).toHaveLength(2);
		expect(JSON.stringify(envelopes)).toContain("Database unavailable");
		expect(JSON.stringify(envelopes)).toContain("This operation was aborted");
	} finally {
		await client?.close();
	}
});
