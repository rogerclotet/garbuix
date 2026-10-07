import { describe, expect, it } from "vitest";
import { addDaysToDateKey } from "@/lib/puzzle-dates";
import {
	buildPuzzleHeadline,
	FIRST_PUZZLE_DATE_KEY,
	formatShortPuzzleDate,
	getPuzzleNumber,
} from "@/lib/puzzle-number";

describe("puzzle-number", () => {
	it("numbers the first puzzle #1 and counts calendar days after it", () => {
		expect(getPuzzleNumber(FIRST_PUZZLE_DATE_KEY)).toBe(1);
		expect(getPuzzleNumber(addDaysToDateKey(FIRST_PUZZLE_DATE_KEY, 1))).toBe(2);
		expect(getPuzzleNumber(addDaysToDateKey(FIRST_PUZZLE_DATE_KEY, 365))).toBe(
			366,
		);
	});

	it("is not thrown off by daylight saving changes", () => {
		// Spans both Madrid DST switches; date keys carry no time of day.
		const later = addDaysToDateKey(FIRST_PUZZLE_DATE_KEY, 400);
		expect(getPuzzleNumber(later)).toBe(401);
	});

	it("has no number for days before the first puzzle", () => {
		expect(getPuzzleNumber(addDaysToDateKey(FIRST_PUZZLE_DATE_KEY, -1))).toBe(
			null,
		);
	});

	it("formats dates as day/month/year without padding", () => {
		expect(formatShortPuzzleDate("2026-11-07")).toBe("7/11/2026");
		expect(formatShortPuzzleDate("2026-01-25")).toBe("25/1/2026");
	});

	it("builds the post title", () => {
		const dateKey = addDaysToDateKey(FIRST_PUZZLE_DATE_KEY, 41);
		const [year, month, day] = dateKey.split("-");
		expect(buildPuzzleHeadline(dateKey)).toBe(
			`Garbuix #42 - ${Number(day)}/${Number(month)}/${year}`,
		);
		expect(buildPuzzleHeadline("2020-01-02")).toBe("Garbuix - 2/1/2020");
	});
});
