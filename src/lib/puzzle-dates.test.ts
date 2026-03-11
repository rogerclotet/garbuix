import { describe, expect, it } from "vitest";
import {
	dateKeyToSeed,
	getDateKeyForDate,
	getNextRolloverAt,
	seedToDateKey,
} from "@/lib/puzzle-dates";

describe("puzzle-dates", () => {
	it("round trips seeds and date keys", () => {
		expect(seedToDateKey(dateKeyToSeed("2026-03-10"))).toBe("2026-03-10");
	});

	it("formats Europe/Madrid dates across DST-sensitive days", () => {
		expect(getDateKeyForDate(new Date("2026-03-29T00:30:00.000Z"))).toBe(
			"2026-03-29",
		);
		expect(getDateKeyForDate(new Date("2026-10-25T23:30:00.000Z"))).toBe(
			"2026-10-26",
		);
	});

	it("returns a future rollover boundary", () => {
		expect(getNextRolloverAt().getTime()).toBeGreaterThan(Date.now());
	});
});
