import { describe, expect, it, vi } from "vitest";
import { getUsagePage, usageEventSchema } from "./usage-events";
import { toPostHogAggregate } from "./usage-export.server";
import { handleUsageRequest } from "./usage-request.server";

const hint = { event: "hint_requested", page: "classic", value: "text" };
const request = (body: unknown, headers?: Record<string, string>) =>
	new Request("https://garbuix.test/api/usage", {
		method: "POST",
		body: JSON.stringify(body),
		headers: {
			Origin: "https://garbuix.test",
			"Content-Type": "application/json",
			...headers,
		},
	});

describe("anonymous usage boundary", () => {
	it.each([
		"user_id",
		"distinct_id",
		"device_id",
		"session_id",
		"email",
		"$ip",
		"timestamp",
		"day",
		"count",
		"url",
	])("rejects the entire event when %s is included", async (field) => {
		const increment = vi.fn();
		const response = await handleUsageRequest(
			request({ ...hint, [field]: "private" }),
			{ enabled: true, increment },
		);
		expect(response.status).toBe(400);
		expect(increment).not.toHaveBeenCalled();
	});
	it("accepts only finite action/option/page combinations", () => {
		expect(usageEventSchema.parse(hint)).toEqual(hint);
		for (const event of [
			{ ...hint, value: "a free-text answer" },
			{ ...hint, page: "preferences" },
			{ event: "puzzle_completed", page: "classic" },
			{
				event: "theme_selected",
				page: "classic",
				value: "private@example.com",
			},
		])
			expect(usageEventSchema.safeParse(event).success).toBe(false);
		expect(getUsagePage("/mini/")).toBe("mini");
		expect(getUsagePage("/users/private@example.com")).toBeUndefined();
	});
	it("ignores credentials and only passes the validated counter dimensions onward", async () => {
		const increment = vi.fn();
		const response = await handleUsageRequest(
			request(hint, {
				Cookie: "account=secret",
				"X-Forwarded-For": "192.0.2.1",
				"X-Posthog-Distinct-Id": "private",
			}),
			{ enabled: true, increment },
		);
		expect(response.status).toBe(204);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(increment).toHaveBeenCalledExactlyOnceWith(hint);
	});
	it("does not collect when disabled and rejects foreign origins and oversized bodies", async () => {
		const increment = vi.fn();
		expect(
			(await handleUsageRequest(request(hint), { enabled: false, increment }))
				.status,
		).toBe(204);
		expect(
			(
				await handleUsageRequest(
					request(hint, { Origin: "https://foreign.test" }),
					{ enabled: true, increment },
				)
			).status,
		).toBe(403);
		expect(
			(
				await handleUsageRequest(request({ extra: "x".repeat(600) }), {
					enabled: true,
					increment,
				})
			).status,
		).toBe(413);
		expect(increment).not.toHaveBeenCalled();
	});
	it("contains storage failures without logging the request", async () => {
		const response = await handleUsageRequest(request(hint), {
			enabled: true,
			increment: async () => {
				throw new Error("database unavailable");
			},
		});
		expect(response.status).toBe(503);
	});
});

describe("aggregate export", () => {
	it("exports a count with a stable bucket identity and no profile processing", () => {
		const bucket = {
			id: "d9c1de94-a0de-4f81-b155-2f5d7d9b333c",
			day: "2026-09-27",
			event: "hint_requested",
			page: "mini",
			value: "letter",
			count: "243",
		};
		const exported = toPostHogAggregate(bucket);
		expect(toPostHogAggregate(bucket)).toEqual(exported);
		expect(exported).toEqual({
			uuid: bucket.id,
			event: "daily_usage",
			timestamp: "2026-09-27T12:00:00.000Z",
			properties: {
				distinct_id: `aggregate:${bucket.id}`,
				$process_person_profile: false,
				$geoip_disable: true,
				day: bucket.day,
				timezone: "Europe/Madrid",
				action: "hint_requested",
				page: "mini",
				value: "letter",
				count: 243,
				schema_version: 1,
			},
		});
		expect(() =>
			toPostHogAggregate({ ...bucket, value: "private@example.com" }),
		).toThrow();
	});
});
