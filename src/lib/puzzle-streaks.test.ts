import { describe, expect, it } from "vitest";
import { calculateHistoryStreaks } from "@/lib/puzzle-streaks";
import type { HistorySummaryEntry } from "@/lib/puzzle-types";

function buildEntry(
	dateKey: string,
	completed: boolean,
	lastUpdated = `${dateKey}T12:00:00.000Z`,
): HistorySummaryEntry {
	return {
		dateKey,
		seed: Number(dateKey.replaceAll("-", "")),
		totalWords: 10,
		guessedWords: completed ? 10 : 4,
		guessCount: completed ? 8 : 5,
		hintsUsed: completed ? 1 : 0,
		completed,
		lastUpdated,
	};
}

describe("puzzle-streaks", () => {
	it("keeps the current streak alive when yesterday was completed and today is untouched", () => {
		const streaks = calculateHistoryStreaks(
			[
				buildEntry("2026-03-14", true),
				buildEntry("2026-03-13", true),
				buildEntry("2026-03-12", true),
			],
			{ referenceDateKey: "2026-03-15" },
		);

		expect(streaks.currentStreak).toBe(3);
		expect(streaks.bestStreak).toBe(3);
	});

	it("breaks the current streak when the reference day exists but is incomplete", () => {
		const streaks = calculateHistoryStreaks(
			[
				buildEntry("2026-03-15", false),
				buildEntry("2026-03-14", true),
				buildEntry("2026-03-13", true),
				buildEntry("2026-03-12", true),
			],
			{ referenceDateKey: "2026-03-15" },
		);

		expect(streaks.currentStreak).toBe(0);
		expect(streaks.bestStreak).toBe(3);
	});

	it("breaks streaks across missing or incomplete days and still tracks the best run", () => {
		const streaks = calculateHistoryStreaks(
			[
				buildEntry("2026-03-15", true),
				buildEntry("2026-03-14", true),
				buildEntry("2026-03-12", true),
				buildEntry("2026-03-11", false),
				buildEntry("2026-03-10", true),
				buildEntry("2026-03-09", true),
				buildEntry("2026-03-08", true),
			],
			{ referenceDateKey: "2026-03-15" },
		);

		expect(streaks.currentStreak).toBe(2);
		expect(streaks.bestStreak).toBe(3);
	});
});
