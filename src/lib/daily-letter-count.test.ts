import { describe, expect, it } from "vitest";
import {
	getDailyLetterCount,
	SEVEN_LETTER_DAYS_START,
} from "@/lib/daily-letter-count";

describe("getDailyLetterCount", () => {
	it("starts the seven-letter days on a holiday", () => {
		expect(SEVEN_LETTER_DAYS_START).toBe("2026-10-12");
		expect(getDailyLetterCount(SEVEN_LETTER_DAYS_START)).toBe(7);
	});

	it("gives seven letters to every later Sunday", () => {
		expect(getDailyLetterCount("2026-10-18")).toBe(7);
		expect(getDailyLetterCount("2026-10-25")).toBe(7);
		expect(getDailyLetterCount("2027-01-03")).toBe(7);
	});

	// None of the fixed holidays lands on a Sunday in 2028, so each one counts
	// here on its own.
	it("gives seven letters to every fixed holiday", () => {
		for (const dateKey of [
			"2028-01-01",
			"2028-01-06",
			"2028-05-01",
			"2028-06-24",
			"2028-08-15",
			"2028-09-11",
			"2028-10-12",
			"2028-11-01",
			"2028-12-06",
			"2028-12-08",
			"2028-12-25",
			"2028-12-26",
		]) {
			expect(getDailyLetterCount(dateKey)).toBe(7);
		}
	});

	it("keeps six letters on ordinary days", () => {
		for (const dateKey of [
			"2026-10-19",
			"2026-10-20",
			"2026-10-21",
			"2026-10-22",
			"2026-10-23",
			"2026-10-24",
			"2028-12-07",
			"2028-12-27",
		]) {
			expect(getDailyLetterCount(dateKey)).toBe(6);
		}
	});

	it("keeps six letters on Sundays and holidays before the start date", () => {
		expect(getDailyLetterCount("2026-10-11")).toBe(6);
		expect(getDailyLetterCount("2026-09-11")).toBe(6);
	});

	it("moves the first seven-letter day with the start date", () => {
		expect(getDailyLetterCount("2026-10-11", "2026-10-11")).toBe(7);
		expect(getDailyLetterCount("2026-10-12", "2026-10-13")).toBe(6);
		expect(getDailyLetterCount("2026-10-18", "2026-11-01")).toBe(6);
	});
});
