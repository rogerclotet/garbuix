import { createServer, type IncomingHttpHeaders } from "node:http";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	captureServerEvent,
	captureServerException,
	observeServerAction,
} from "@/lib/observability-server";
import { captureUmamiServerEvent, proxyUmamiRequest } from "@/lib/umami-server";

let umami: { host: string; websiteId: string } | undefined;
const websiteId = "e676c9b4-11e4-4ef1-a4d7-87001773e9f2";
const received: {
	headers: IncomingHttpHeaders;
	body: unknown;
	url?: string;
}[] = [];
let upstreamStatus = 200;
let requestHeaders: Headers | undefined;
let host = "";

vi.mock("@/lib/observability-config", () => ({
	getServerObservabilityConfig: () => ({ umami }),
}));
vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => {
		if (!requestHeaders) throw new Error("No request");
		return requestHeaders;
	},
}));

const server = createServer(async (req, res) => {
	let body = "";
	for await (const chunk of req) body += chunk;
	received.push({ headers: req.headers, body: JSON.parse(body), url: req.url });
	res.writeHead(upstreamStatus, { "Set-Cookie": "upstream=secret" });
	res.end(
		JSON.stringify({
			cache: "anonymous-cache-token",
			sessionId: "upstream-session",
			visitId: "upstream-visit",
		}),
	);
});

beforeAll(async () => {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("No TCP address");
	host = `http://127.0.0.1:${address.port}/analytics/`;
});
afterAll(async () => {
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
});
beforeEach(() => {
	umami = { host, websiteId };
	received.length = 0;
	upstreamStatus = 200;
	requestHeaders = new Headers({
		"user-agent": "browser-user-agent",
		"x-forwarded-for": "203.0.113.8",
		"x-posthog-distinct-id": "private-user",
		"x-posthog-session-id": "private-session",
		"x-posthog-window-id": "private-window",
	});
});

function browserRequest(body: unknown) {
	return new Request("https://garbuix.example/api/u", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"User-Agent": "browser-user-agent",
			"X-Forwarded-For": "203.0.113.8",
			"X-Real-IP": "203.0.113.8",
			"CF-Connecting-IP": "203.0.113.8",
			Cookie: "session=secret",
			Authorization: "Bearer secret",
		},
		body: JSON.stringify(body),
	});
}

describe("Umami proxy", () => {
	it("preserves anonymous visitor inputs while stripping account data and credentials", async () => {
		const response = await proxyUmamiRequest(
			browserRequest({
				type: "event",
				payload: {
					name: "puzzle_loaded",
					url: "/mini?email=private@example.com#secret",
					id: "private-user",
					referrer: "https://private.example.com",
					title: "Private Name",
					language: "private-browser",
					screen: "123x456",
					website: "override",
					data: {
						game_mode: "mini",
						word_count: 4,
						user_id: "private-user",
						device_id: "private-device",
						email: "private@example.com",
						nested: { token: "secret" },
					},
				},
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ cache: "anonymous-cache-token" });
		expect(response.headers.get("set-cookie")).toBeNull();
		expect(received).toHaveLength(1);
		expect(received[0]).toMatchObject({
			url: "/analytics/api/send",
			body: {
				type: "event",
				payload: {
					website: websiteId,
					name: "puzzle_loaded",
					url: "/mini",
					data: { game_mode: "mini", word_count: 4 },
				},
			},
		});
		expect(received[0].headers["user-agent"]).toBe("browser-user-agent");
		expect(received[0].headers["x-forwarded-for"]).toBe("203.0.113.8");
		expect(received[0].headers["x-real-ip"]).toBe("203.0.113.8");
		expect(received[0].headers["cf-connecting-ip"]).toBe("203.0.113.8");
		expect(JSON.stringify(received[0])).not.toContain("private");
		expect(received[0].headers.cookie).toBeUndefined();
		expect(received[0].headers.authorization).toBeUndefined();
	});

	it("forwards the opaque visit cache without forwarding PostHog IDs", async () => {
		const request = browserRequest({
			type: "event",
			payload: { name: "puzzle_loaded", url: "/" },
		});
		request.headers.set("x-umami-cache", "previous-anonymous-token");
		request.headers.set("x-posthog-distinct-id", "account-123");
		await proxyUmamiRequest(request);
		expect(received[0].headers["x-umami-cache"]).toBe(
			"previous-anonymous-token",
		);
		expect(received[0].headers["x-posthog-distinct-id"]).toBeUndefined();
	});

	it.each(["identify", "performance"])(
		"rejects %s messages from older clients",
		async (type) => {
			expect(
				(
					await proxyUmamiRequest(
						browserRequest({
							type,
							payload: {
								url: "/",
								id: "private-user",
								data: { email: "private@example.com" },
							},
						}),
					)
				).status,
			).toBe(400);
			expect(received).toHaveLength(0);
		},
	);

	it("does not contact Umami when disabled or given invalid input", async () => {
		expect(
			(await proxyUmamiRequest(browserRequest({ type: "invalid" }))).status,
		).toBe(400);
		umami = undefined;
		expect(
			(
				await proxyUmamiRequest(
					browserRequest({ type: "event", payload: { url: "/" } }),
				)
			).status,
		).toBe(404);
		expect(received).toHaveLength(0);
	});

	it("handles malformed JSON and upstream errors without reporting another event", async () => {
		const malformed = new Request("https://garbuix.example/api/u", {
			method: "POST",
			body: "{",
		});
		expect((await proxyUmamiRequest(malformed)).status).toBe(400);
		upstreamStatus = 500;
		expect(
			(
				await proxyUmamiRequest(
					browserRequest({ type: "event", payload: { url: "/" } }),
				)
			).status,
		).toBe(502);
		expect(received).toHaveLength(1);
	});
});

describe("Umami server events", () => {
	it("preserves anonymous request attribution but drops account identity and context", async () => {
		await observeServerAction(
			"sync",
			async () => {
				captureServerEvent({
					event: "puzzle_progress_synced_server",
					properties: { completed: true },
				});
			},
			{ distinctId: "user-1", properties: { puzzle_id: "puzzle-1" } },
		);
		await vi.waitFor(() => expect(received).toHaveLength(1));
		expect(received[0].headers["user-agent"]).toBe("browser-user-agent");
		expect(received[0].headers["x-forwarded-for"]).toBe("203.0.113.8");
		expect(received[0].headers["x-posthog-distinct-id"]).toBeUndefined();

		expect(received[0].body).toEqual({
			type: "event",
			payload: {
				website: websiteId,
				name: "puzzle_progress_synced_server",
				url: "/server",
				data: { completed: true },
			},
		});
	});

	it("sends product events but excludes errors outside HTTP requests", async () => {
		requestHeaders = undefined;
		captureServerEvent({
			event: "daily_puzzle_generated",
			properties: { word_count: 8 },
		});
		captureServerException(new Error("generation failed"), {
			properties: { action: "generate" },
		});
		await vi.waitFor(() => expect(received).toHaveLength(1));
		expect(received.map((item) => item.body)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					payload: expect.objectContaining({
						website: websiteId,
						name: "daily_puzzle_generated",
						data: { word_count: 8 },
					}),
				}),
			]),
		);
	});

	it("ignores unavailable analytics servers", async () => {
		umami = { host: "http://127.0.0.1:1", websiteId };
		await expect(
			captureUmamiServerEvent({ event: "puzzle_loaded" }),
		).resolves.toBeUndefined();
	});
});
