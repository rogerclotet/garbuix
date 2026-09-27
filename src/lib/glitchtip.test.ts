import { createServer } from "node:http";
import * as Sentry from "@sentry/tanstackstart-react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	glitchtipEnvSchema,
	serializeGlitchTipConfig,
} from "./glitchtip-config";
import { scrubGlitchTipEvent } from "./glitchtip-scrub";
import { proxyGlitchTipRequest } from "./glitchtip-tunnel.server";

describe("GlitchTip configuration", () => {
	it("allows an unconfigured app and validates settings at the boundary", () => {
		expect(
			glitchtipEnvSchema.parse({ GLITCHTIP_DSN: "" }).GLITCHTIP_DSN,
		).toBeUndefined();
		for (const config of [
			{ GLITCHTIP_DSN: "https://example.com/1" },
			{ GLITCHTIP_DSN: "https://key:secret@example.com/1" },
			{ GLITCHTIP_TRACES_SAMPLE_RATE: "1.5" },
			{ GLITCHTIP_TRACES_SAMPLE_RATE: "no" },
			{ GLITCHTIP_ENABLE_LOGS: "yes" },
		])
			expect(glitchtipEnvSchema.safeParse(config).success).toBe(false);
	});

	it("keeps runtime configuration from terminating its HTML script element", () => {
		const config = {
			dsn: "https://key@example.com/1",
			environment: "</script><script>alert(1)</script>",
			tracesSampleRate: 0.1,
			enableLogs: false,
		};
		const serialized = serializeGlitchTipConfig(config);
		expect(serialized).not.toContain("<");
		expect(JSON.parse(serialized)).toEqual(config);
	});

	it("removes request credentials and bodies while preserving useful stack traces", () => {
		const event: Sentry.Event = {
			exception: { values: [{ type: "Error", value: "test" }] },
			request: {
				url: "https://app.example.com/auth?code=secret#token",
				headers: { Cookie: "session=secret" },
				cookies: { session: "secret" },
				data: "password=secret",
				query_string: "code=secret",
			},
		};
		expect(scrubGlitchTipEvent(event)).toEqual({
			exception: event.exception,
			request: { url: "https://app.example.com/auth" },
		});
	});
});

describe("GlitchTip envelope transport", () => {
	const received: {
		url: string | undefined;
		body: string;
		cookie: string | undefined;
	}[] = [];
	let origin: string;
	let dsn: string;
	const collector = createServer(async (request, response) => {
		let body = "";
		for await (const chunk of request) body += chunk.toString();
		received.push({ url: request.url, body, cookie: request.headers.cookie });
		response.writeHead(200, {
			"Set-Cookie": "upstream=secret",
			"X-Sentry-Rate-Limits": "60:error:organization",
		});
		response.end("{}");
	});
	beforeAll(async () => {
		await new Promise<void>((resolve) =>
			collector.listen(0, "127.0.0.1", resolve),
		);
		const address = collector.address();
		if (!address || typeof address === "string")
			throw new Error("Missing collector port");
		origin = `http://127.0.0.1:${address.port}`;
		dsn = `http://public@127.0.0.1:${address.port}/prefix/1`;
	});
	afterAll(async () => {
		await Sentry.close(2000);
		await new Promise<void>((resolve, reject) =>
			collector.close((error) => (error ? reject(error) : resolve())),
		);
	});

	it("forwards only to the configured project and preserves SDK rate-limit headers", async () => {
		const envelope = `${JSON.stringify({ dsn })}\n{"type":"event"}\n{"message":"test"}`;
		const response = await proxyGlitchTipRequest(
			new Request(`${origin}/api/monitoring`, {
				method: "POST",
				body: envelope,
				headers: { Cookie: "app-session=secret" },
			}),
			dsn,
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("set-cookie")).toBeNull();
		expect(response.headers.get("x-sentry-rate-limits")).toBe(
			"60:error:organization",
		);
		expect(received.at(-1)).toEqual({
			url: "/prefix/api/1/envelope/?sentry_key=public&sentry_version=7",
			body: envelope,
			cookie: undefined,
		});
	});

	it("rejects missing configuration, malformed input, foreign DSNs and oversized streams", async () => {
		const before = received.length;
		const request = (body: string) =>
			new Request(`${origin}/api/monitoring`, { method: "POST", body });
		expect((await proxyGlitchTipRequest(request("{}"), undefined)).status).toBe(
			404,
		);
		expect((await proxyGlitchTipRequest(request("invalid"), dsn)).status).toBe(
			400,
		);
		expect(
			(
				await proxyGlitchTipRequest(
					request(JSON.stringify({ dsn: "http://attacker@127.0.0.1/2" })),
					dsn,
				)
			).status,
		).toBe(403);
		expect(
			(await proxyGlitchTipRequest(request("x".repeat(1024 * 1024 + 1)), dsn))
				.status,
		).toBe(413);
		expect(received.length).toBe(before);
	});

	it("sends real SDK exceptions with release, stack and isolated user context", async () => {
		Sentry.init({
			dsn,
			release: "garbuix@test",
			environment: "test",
			defaultIntegrations: false,
			beforeSend: scrubGlitchTipEvent,
		});
		await Promise.all(
			["alice", "bob"].map((id) =>
				Sentry.withIsolationScope(async (scope) => {
					scope.setUser({ id });
					await Promise.resolve();
					Sentry.captureException(new Error(`failure-${id}`));
				}),
			),
		);
		expect(await Sentry.flush(2000)).toBe(true);
		const events = received.flatMap(({ body }) =>
			body
				.split("\n")
				.filter((line) => line.includes('"exception"'))
				.map((line) => JSON.parse(line)),
		);
		for (const id of ["alice", "bob"]) {
			const event = events.find((entry) => entry.user?.id === id);
			expect(event).toMatchObject({
				release: "garbuix@test",
				environment: "test",
				exception: { values: [{ value: `failure-${id}` }] },
			});
			expect(
				event.exception.values[0].stacktrace.frames.length,
			).toBeGreaterThan(0);
		}
	});
});
