import { describe, expect, it } from "vitest";
import {
	getDailyLetterCount,
	SEVEN_LETTER_SUNDAYS_START,
} from "@/lib/daily-letter-count";

describe("getDailyLetterCount", () => {
	it("starts the seven-letter Sundays on a Sunday", () => {
		expect(getDailyLetterCount(SEVEN_LETTER_SUNDAYS_START)).toBe(7);
	});

	it("gives seven letters to every later Sunday", () => {
		expect(getDailyLetterCount("2026-10-25")).toBe(7);
		expect(getDailyLetterCount("2027-01-03")).toBe(7);
	});

	it("keeps six letters on the other days of the week", () => {
		for (const dateKey of [
			"2026-10-19",
			"2026-10-20",
			"2026-10-21",
			"2026-10-22",
			"2026-10-23",
			"2026-10-24",
		]) {
			expect(getDailyLetterCount(dateKey)).toBe(6);
		}
	});

	it("keeps six letters on Sundays before the start date", () => {
		expect(getDailyLetterCount("2026-10-11")).toBe(6);
		expect(getDailyLetterCount("2026-04-05")).toBe(6);
	});

	it("moves the first seven-letter Sunday with the start date", () => {
		expect(getDailyLetterCount("2026-10-11", "2026-10-11")).toBe(7);
		expect(getDailyLetterCount("2026-10-18", "2026-11-01")).toBe(6);
	});
});
