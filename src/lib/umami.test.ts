// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Metric } from "web-vitals";
import { createUmamiClient } from "@/lib/umami";

const fetchMock = vi.fn<typeof fetch>();

describe("Umami client privacy", () => {
	beforeEach(() => {
		fetchMock
			.mockReset()
			.mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);
	});
	afterEach(() => {
		window.history.replaceState({}, "", "/");
		vi.unstubAllGlobals();
	});

	it.each(["mini", "classic"])(
		"preserves %s game segmentation through the privacy filter",
		async (game_mode) => {
			await createUmamiClient().captureEvent("puzzle_hint_requested", {
				game_mode,
				hint_type: "letter",
				hints_used_after: 1,
				user_id: "private-user",
			});
			expect(
				JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).payload.data,
			).toEqual({ game_mode, hint_type: "letter", hints_used_after: 1 });
		},
	);

	it("rejects free-form text masquerading as a game mode", async () => {
		await createUmamiClient().captureEvent("puzzle_loaded", {
			game_mode: "private@example.com",
		});
		expect(
			JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).payload.data,
		).toEqual({});
	});

	it("sends only reviewed action data and a static page path", () => {
		window.history.replaceState(
			{},
			"",
			"/mini?email=private@example.com#token",
		);
		createUmamiClient().captureEvent("puzzle_guess_result", {
			matched: true,
			guess_length: 5,
			result_kind: "new_word",
			user_id: "account-123",
			device_id: "device-123",
			email: "private@example.com",
			name: "Private Name",
			avatar: "https://private.example/avatar",
			$current_url: window.location.href,
			nested: { email: "private@example.com" },
			error_message: "private@example.com",
			guess: "private text",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe("/api/u");
		const options = fetchMock.mock.calls[0][1];
		expect(JSON.parse(String(options?.body))).toEqual({
			type: "event",
			payload: {
				url: "/mini",
				name: "puzzle_guess_result",
				data: { matched: true, guess_length: 5, result_kind: "new_word" },
			},
		});
		expect(options).toMatchObject({
			credentials: "omit",
			referrerPolicy: "no-referrer",
			keepalive: true,
		});
	});

	it.each([
		["LCP", "lcp", 1234.5],
		["INP", "inp", 80],
		["CLS", "cls", 0],
		["FCP", "fcp", 600],
		["TTFB", "ttfb", 150],
	] satisfies [Metric["name"], string, number][])(
		"sends %s as a native performance measurement",
		async (name, key, value) => {
			await createUmamiClient().captureWebVital(
				{ name, value },
				"/mini?secret=email#private",
			);
			expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
				type: "performance",
				payload: { url: "/mini", [key]: value },
			});
			expect(fetchMock.mock.calls[0][1]).toMatchObject({
				keepalive: true,
				credentials: "omit",
				referrerPolicy: "no-referrer",
			});
		},
	);

	it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 60_001])(
		"drops invalid performance measurements: %s",
		async (value) => {
			await createUmamiClient().captureWebVital({ name: "LCP", value }, "/");
			expect(fetchMock).not.toHaveBeenCalled();
		},
	);

	it("shares the anonymous cache between events and performance and tolerates offline metrics", async () => {
		fetchMock.mockImplementation(async () =>
			Response.json({ cache: "anonymous-visit-token" }),
		);
		const client = createUmamiClient();
		await client.captureEvent("$pageview");
		await client.captureWebVital(
			{ name: "CLS", value: 0.02 },
			"/users/private@example.com",
		);
		expect(fetchMock.mock.calls[1][1]?.headers).toHaveProperty(
			"x-umami-cache",
			"anonymous-visit-token",
		);
		expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
			type: "performance",
			payload: { url: "/other", cls: 0.02 },
		});
		fetchMock.mockRejectedValue(new TypeError("offline"));
		await expect(
			client.captureWebVital({ name: "LCP", value: 1000 }, "/"),
		).resolves.toBeUndefined();
	});

	it("has no identification API and drops errors, generic web_vital events, and unknown events", () => {
		const client = createUmamiClient();
		expect(client).not.toHaveProperty("identifyUser");
		for (const event of ["$exception", "web_vital", "private@example.com"])
			client.captureEvent(event);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does not send personal text disguised as a known property or URL path", () => {
		window.history.replaceState({}, "", "/users/private@example.com");
		createUmamiClient().captureEvent("puzzle_loaded", {
			word_count: "private@example.com",
			theme: "private@example.com",
			total_words: 6,
		});
		expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
			type: "event",
			payload: {
				name: "puzzle_loaded",
				url: "/other",
				data: { total_words: 6 },
			},
		});
	});

	it("does not throw or reject when offline", async () => {
		fetchMock.mockRejectedValue(new TypeError("offline"));
		expect(() =>
			createUmamiClient().captureEvent("puzzle_loaded"),
		).not.toThrow();
		await Promise.resolve();
	});

	it("reuses Umami's anonymous visit cache in memory without an application ID", async () => {
		fetchMock.mockImplementation(async () =>
			Response.json({ cache: "anonymous-visit-token" }),
		);
		const client = createUmamiClient();
		await client.captureEvent("puzzle_loaded");
		await client.captureEvent("puzzle_guess_result", { matched: true });
		expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty(
			"x-umami-cache",
		);
		expect(fetchMock.mock.calls[1][1]?.headers).toHaveProperty(
			"x-umami-cache",
			"anonymous-visit-token",
		);
		expect(
			JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).payload,
		).not.toHaveProperty("id");
		await createUmamiClient().captureEvent("puzzle_loaded");
		expect(fetchMock.mock.calls[2][1]?.headers).not.toHaveProperty(
			"x-umami-cache",
		);
	});
});
