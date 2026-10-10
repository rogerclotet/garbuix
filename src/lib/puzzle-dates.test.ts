import { describe, expect, it } from "vitest";
import {
	addDaysToDateKey,
	dateKeyToSeed,
	formatMadridTime,
	formatPuzzleDate,
	getDateKeyForDate,
	getNextPregenerationAt,
	getNextRolloverAt,
	getTodayDateKey,
	getTomorrowDateKey,
	getYesterdayDateKey,
	isFutureDateKey,
	isPlayableDateKey,
	isValidDateKey,
	isWithinPregenerationWindow,
	seedToDateKey,
} from "@/lib/puzzle-dates";

describe("puzzle-dates", () => {
	it.each([
		["2026-01-01", "1 de gener del 2026"],
		["2024-02-29", "29 de febrer del 2024"],
		["2026-03-29", "29 de març del 2026"],
		["2026-04-01", "1 d’abril del 2026"],
		["2026-05-01", "1 de maig del 2026"],
		["2026-06-01", "1 de juny del 2026"],
		["2026-07-01", "1 de juliol del 2026"],
		["2026-08-01", "1 d’agost del 2026"],
		["2026-09-01", "1 de setembre del 2026"],
		["2026-10-25", "25 d’octubre del 2026"],
		["2026-11-01", "1 de novembre del 2026"],
		["2026-12-31", "31 de desembre del 2026"],
	])("formats puzzle date %s in Catalan", (dateKey, expected) => {
		expect(formatPuzzleDate(dateKey)).toBe(expected);
	});

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

	it("adds day offsets to date keys", () => {
		expect(addDaysToDateKey("2026-03-31", 1)).toBe("2026-04-01");
		expect(addDaysToDateKey("2026-01-01", -1)).toBe("2025-12-31");
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
	it("opens the pre-generation window at exactly 23:00 Madrid time", () => {
		const scheduled = new Date("2026-10-03T21:00:00.000Z");
		expect(getNextRolloverAt("Europe/Madrid", scheduled).toISOString()).toBe(
			"2026-10-03T22:00:00.000Z",
		);
		expect(isWithinPregenerationWindow("Europe/Madrid", scheduled)).toBe(true);
		expect(
			isWithinPregenerationWindow(
				"Europe/Madrid",
				new Date(scheduled.getTime() - 1),
			),
		).toBe(false);
	});

	it.each([
		"2026-10-03T19:05:00Z", // 21:05 Madrid
		"2026-10-03T20:59:59Z", // 22:59:59 Madrid
		"2026-10-03T22:00:00Z", // Midnight Madrid: tomorrow's window has not started
		"2026-01-03T21:59:59Z", // 22:59:59 Madrid in winter
	])("stays outside the pre-generation window at %s", (now) => {
		expect(isWithinPregenerationWindow("Europe/Madrid", new Date(now))).toBe(
			false,
		);
	});

	it.each([
		["2026-10-03T21:59:59Z", "2026-10-04"], // 23:59:59 Madrid
		["2026-01-03T22:00:00Z", "2026-01-04"], // 23:00 Madrid in winter
		["2026-03-28T22:30:00Z", "2026-03-29"], // Night before clocks move forward
		["2026-10-24T21:30:00Z", "2026-10-25"], // Night before clocks move back
	])("pre-generates the following Madrid day at %s", (now, tomorrow) => {
		const date = new Date(now);
		expect(isWithinPregenerationWindow("Europe/Madrid", date)).toBe(true);
		expect(addDaysToDateKey(getDateKeyForDate(date), 1)).toBe(tomorrow);
	});

	it("accepts well-formed date keys", () => {
		expect(isValidDateKey("2026-03-10")).toBe(true);
		expect(isValidDateKey("2024-02-29")).toBe(true);
	});

	it("rejects malformed and impossible date keys", () => {
		expect(isValidDateKey("2026-3-10")).toBe(false);
		expect(isValidDateKey("2026-02-31")).toBe(false);
		expect(isValidDateKey("2023-02-29")).toBe(false);
		expect(isValidDateKey("2026-13-01")).toBe(false);
		expect(isValidDateKey("not-a-date")).toBe(false);
		expect(isValidDateKey("")).toBe(false);
	});

	it("treats any date after today as in the future", () => {
		expect(isFutureDateKey(getTomorrowDateKey())).toBe(true);
		expect(isFutureDateKey(getTodayDateKey())).toBe(false);
		expect(isFutureDateKey(getYesterdayDateKey())).toBe(false);
	});

	it("only lets requests name a real, non-future date", () => {
		expect(isPlayableDateKey(getTodayDateKey())).toBe(true);
		expect(isPlayableDateKey(getYesterdayDateKey())).toBe(true);
		// Tomorrow's puzzle is pre-generated before rollover, so it exists in the
		// database — the guard is what keeps a request from reaching it.
		expect(isPlayableDateKey(getTomorrowDateKey())).toBe(false);
		expect(isPlayableDateKey("2099-01-01")).toBe(false);
		expect(isPlayableDateKey("2026-02-31")).toBe(false);
	});
});
