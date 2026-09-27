import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildErrorReport } from "./error-report";
import { createErrorReporter } from "./error-tracking.server";
import { posthogEnvSchema } from "./error-tracking-config";
import { handleErrorReport } from "./error-tracking-request.server";

describe("PostHog error delivery", () => {
	const received: { body: string; cookie?: string; forwarded?: string }[] = [];
	const server = createServer(async (request, response) => {
		let body = "";
		for await (const chunk of request) body += chunk;
		received.push({
			body,
			cookie: request.headers.cookie,
			forwarded: request.headers["x-forwarded-for"]?.toString(),
		});
		response.writeHead(200).end("{}");
	});
	let host: string;
	beforeAll(async () => {
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address();
		if (!address || typeof address === "string")
			throw new Error("Missing collector address");
		host = `http://127.0.0.1:${address.port}`;
	});
	afterAll(async () => {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});
	beforeEach(() => {
		received.length = 0;
	});
	const reporter = () =>
		createErrorReporter({
			host,
			key: "test-key",
			environment: "test",
			release: "garbuix@test",
		});
	const request = (body: unknown, headers?: Record<string, string>) =>
		new Request("https://game.test/api/monitoring", {
			method: "POST",
			body: JSON.stringify(body),
			headers: {
				Origin: "https://game.test",
				"Content-Type": "application/json",
				...headers,
			},
		});
	it("uses PostHog exception parsing, redacts messages and assigns a new ID per report", async () => {
		const errors = reporter();
		const error = new Error(
			'Failure for private@example.com at https://game.test/?token=secret with "Roger"',
		);
		errors.capture(error);
		errors.capture(error);
		errors.capture(new TypeError("Second failure"));
		await errors.flush();
		expect(received).toHaveLength(2);
		const [first, second] = received.map(
			({ body }) => JSON.parse(body).batch[0],
		);
		expect(first.event).toBe("$exception");
		expect(
			first.properties.$exception_list[0].stacktrace.frames.length,
		).toBeGreaterThan(0);
		expect(first.properties).toMatchObject({
			$process_person_profile: false,
			$geoip_disable: true,
			runtime: "server",
			release: "garbuix@test",
		});
		expect(first.properties.distinct_id).not.toBe(
			second.properties.distinct_id,
		);
		expect(JSON.stringify(received)).not.toMatch(
			/private@example|token=secret|Roger|session_id|device_id|user_id/,
		);
	});
	it("forwards only validated browser errors, without request metadata, even inside the excluded reporting route", async () => {
		const errors = reporter();
		const payload = buildErrorReport(
			new Error("Browser failure"),
			"browser",
			"garbuix@old-build",
		);
		const response = await errors.withRequest(
			"https://game.test/api/monitoring",
			() =>
				handleErrorReport(
					request(payload, {
						Cookie: "session=private",
						"X-Forwarded-For": "192.0.2.1",
					}),
					(report) => errors.send(report, "browser"),
				),
		);
		expect(response.status).toBe(204);
		expect(received).toHaveLength(1);
		expect(received[0].cookie).toBeUndefined();
		expect(received[0].forwarded).toBeUndefined();
		expect(JSON.parse(received[0].body).batch[0].properties).toMatchObject({
			runtime: "browser",
			release: "garbuix@old-build",
		});
	});
	it("rejects legacy envelopes, additional user fields, foreign origins and oversized reports", async () => {
		const errors = reporter();
		const payload = buildErrorReport(
			new Error("failure"),
			"browser",
			"garbuix@test",
		);
		const send = (report: typeof payload) => errors.send(report, "browser");
		for (const body of [
			{ ...payload, user_id: "private" },
			{
				...payload,
				exceptions: [
					{ ...payload.exceptions[0], request: { cookie: "private" } },
				],
			},
			{ dsn: "old" },
		]) {
			expect((await handleErrorReport(request(body), send)).status).toBe(400);
		}
		expect(
			(
				await handleErrorReport(
					request(payload, { Origin: "https://foreign.test" }),
					send,
				)
			).status,
		).toBe(403);
		expect(
			(await handleErrorReport(request({ extra: "x".repeat(61_000) }), send))
				.status,
		).toBe(413);
		expect((await handleErrorReport(request(payload))).status).toBe(204);
		expect(received).toHaveLength(0);
	});
	it("excludes analytics and reporting failures in concurrent requests while preserving application errors", async () => {
		const errors = reporter();
		await Promise.all(
			["/api/usage", "/ph/e/", "/api/monitoring", "/api/game"].map((path) =>
				errors.withRequest(`https://game.test${path}`, async () => {
					await Promise.resolve();
					errors.capture(new Error(path));
				}),
			),
		);
		await errors.flush();
		expect(received).toHaveLength(1);
		expect(received[0].body).toContain("/api/game");
	});
	it("flushes fatal errors and unhandled rejections from the real Node preload before exiting unsuccessfully", async () => {
		for (const script of [
			'throw new Error("Fatal check")',
			'Promise.reject(new Error("Fatal check"))',
		]) {
			const child = spawn(
				process.execPath,
				[
					"--import",
					"./instrument.server.ts",
					"--input-type=module",
					"-e",
					script,
				],
				{
					env: {
						...process.env,
						NODE_ENV: "test",
						POSTHOG_HOST: host,
						POSTHOG_KEY: "test-key",
					},
					stdio: "ignore",
				},
			);
			const [code] = await once(child, "exit");
			expect(code).toBe(1);
		}
		expect(received).toHaveLength(2);
		for (const { body } of received) {
			expect(
				JSON.parse(body).batch[0].properties.$exception_list[0],
			).toMatchObject({
				value: "Fatal check",
				mechanism: { handled: false },
			});
		}
	});
});

it("allows reporting to be unconfigured and validates the configured host", () => {
	expect(posthogEnvSchema.parse({ POSTHOG_KEY: "", POSTHOG_HOST: "" })).toEqual(
		{ POSTHOG_KEY: undefined, POSTHOG_HOST: undefined },
	);
	expect(() =>
		posthogEnvSchema.parse({ POSTHOG_HOST: "file:///tmp/private" }),
	).toThrow();
});
