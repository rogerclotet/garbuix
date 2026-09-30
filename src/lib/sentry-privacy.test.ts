import * as Sentry from "@sentry/tanstackstart-react";
import { expect, it } from "vitest";
import {
	minimizeSentryEvent,
	sentryPrivacyOptions,
} from "../../sentry-privacy.ts";

it.each([true, false])(
	"preserves handled=%s for alert rules without mechanism data",
	(handled) => {
		const result = minimizeSentryEvent(
			{
				type: undefined,
				exception: {
					values: [
						{
							type: "Error",
							mechanism: {
								type: "private custom mechanism",
								handled,
								data: { email: "player@example.com" },
							},
						},
					],
				},
			},
			{},
		);
		expect(result?.exception?.values?.[0]?.mechanism).toEqual({
			type: "generic",
			handled,
		});
	},
);

it("keeps stack locations but removes personal data and attachments", () => {
	const hint: Sentry.EventHint = {
		attachments: [{ filename: "private.txt", data: "private body" }],
	};
	const result = minimizeSentryEvent(
		{
			type: undefined,
			event_id: "event-id",
			environment: "test",
			release: "release-id",
			user: { email: "player@example.com", ip_address: "192.0.2.1" },
			request: {
				url: "https://app.example/?token=secret",
				data: "private body",
			},
			extra: { name: "Private Player" },
			tags: { email: "player@example.com" },
			contexts: { custom: { name: "Private Player" } },
			breadcrumbs: [{ message: "private body" }],
			message: "Private Player failed",
			exception: {
				values: [
					{
						type: "TypeError",
						value: "Private Player player@example.com secret",
						stacktrace: {
							frames: [
								{
									filename:
										"https://user:secret@app.example/assets/app.js?token=secret#private",
									function: "submitGuess",
									lineno: 42,
									colno: 7,
									vars: { name: "Private Player" },
									context_line: "private body",
								},
							],
						},
					},
				],
			},
			debug_meta: {
				images: [
					{
						type: "sourcemap",
						debug_id: "debug-id",
						code_file: "https://app.example/assets/app.js?token=secret",
					},
				],
			},
		},
		hint,
	);
	const serialized = JSON.stringify(result);
	for (const secret of [
		"Private Player",
		"player@example.com",
		"192.0.2.1",
		"secret",
		"private body",
	]) {
		expect(serialized).not.toContain(secret);
	}
	expect(hint.attachments).toEqual([]);
	expect(result?.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({
		filename: "app.js",
		function: "submitGuess",
		lineno: 42,
		colno: 7,
	});
	expect(result?.debug_meta?.images?.[0]?.debug_id).toBe("debug-id");
	expect(result?.release).toBe("release-id");
});

it("drops message-only events and filters custom exception names", () => {
	expect(
		minimizeSentryEvent({ type: undefined, message: "player@example.com" }, {}),
	).toBeNull();
	expect(
		minimizeSentryEvent(
			{
				type: undefined,
				exception: {
					values: [{ type: "player@example.com", value: "secret" }],
				},
			},
			{},
		)?.exception?.values?.[0]?.type,
	).toBe("Error");
});

it("applies the privacy hook to real SDK envelopes", async () => {
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
		Sentry.withScope((scope) => {
			scope.setUser({ email: "player@example.com" });
			scope.setExtra("secret", "private body");
			scope.addAttachment({ filename: "private.txt", data: "private body" });
			Sentry.captureException(new Error("player@example.com private body"));
		});
		await Sentry.flush();
		expect(envelopes).toHaveLength(1);
		const serialized = JSON.stringify(envelopes);
		expect(serialized).toContain("Error details omitted for privacy");
		expect(serialized).not.toContain("player@example.com");
		expect(serialized).not.toContain("private body");
		expect(serialized).not.toContain("private.txt");
	} finally {
		await client?.close();
	}
});
