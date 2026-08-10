import { describe, expect, it } from "vitest";
import {
	addDaysToDateKey,
	dateKeyToSeed,
	formatMadridTime,
	getDateKeyForDate,
	getNextPregenerationAt,
	getNextRolloverAt,
	getTomorrowDateKey,
	isWithinPregenerationWindow,
	seedToDateKey,
} from "@/lib/puzzle-dates";

describe("puzzle-dates", () => {
	it("round trips seeds and date keys", () => {
		expect(seedToDateKey(dateKeyToSeed("2026-03-10"))).toBe("2026-03-10");
	});

	it("formats completion times in Europe/Madrid", () => {
		expect(formatMadridTime("2026-08-10T06:10:00.000Z")).toBe("08:10");
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

	it("adds day offsets to date keys", () => {
		expect(addDaysToDateKey("2026-03-31", 1)).toBe("2026-04-01");
		expect(addDaysToDateKey("2026-01-01", -1)).toBe("2025-12-31");
	});

	it("computes tomorrow in Madrid time", () => {
		expect(getTomorrowDateKey("Europe/Madrid")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("schedules the next pre-generation boundary in the future", () => {
		const referenceDate = new Date("2026-04-12T20:00:00.000Z");
		const nextPregenerationAt = getNextPregenerationAt(
			"Europe/Madrid",
			referenceDate,
		);

		expect(nextPregenerationAt.getTime()).toBeGreaterThan(
			referenceDate.getTime(),
		);
		expect(nextPregenerationAt.getTime()).toBeLessThan(
			getNextRolloverAt("Europe/Madrid", referenceDate).getTime(),
		);
	});

	it("advances pre-generation to the following day when already inside the window", () => {
		const referenceDate = new Date("2026-04-12T21:30:00.000Z");
		const nextPregenerationAt = getNextPregenerationAt(
			"Europe/Madrid",
			referenceDate,
		);
		const nextRollover = getNextRolloverAt("Europe/Madrid", referenceDate);

		expect(isWithinPregenerationWindow("Europe/Madrid", referenceDate)).toBe(
			true,
		);
		expect(nextPregenerationAt.getTime()).toBeGreaterThan(
			nextRollover.getTime(),
		);
	});
});
