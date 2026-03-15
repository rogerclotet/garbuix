import { describe, expect, it } from "vitest";
import {
	calculateCandidateFreshnessPenalty,
	type DailyPuzzleHistoryEntry,
} from "@/lib/crossword-generator";

describe("crossword-generator freshness scoring", () => {
	it("returns no penalty when there is no recent history", () => {
		expect(
			calculateCandidateFreshnessPenalty(
				["a", "b", "c", "d", "e", "f"],
				["abcdef"],
				[],
			),
		).toBe(0);
	});

	it("heavily penalizes reusing the exact same letter set immediately", () => {
		const history: DailyPuzzleHistoryEntry[] = [
			{
				daysAgo: 1,
				letters: ["a", "b", "c", "d", "e", "f"],
				letterSetKey: "abcdef",
				selectedWordKeys: ["abcdef", "face"],
			},
		];

		const repeatedPenalty = calculateCandidateFreshnessPenalty(
			["f", "e", "d", "c", "b", "a"],
			["abcdef", "face"],
			history,
		);
		const freshPenalty = calculateCandidateFreshnessPenalty(
			["a", "b", "c", "g", "h", "i"],
			["abaci", "cabin"],
			history,
		);

		expect(repeatedPenalty).toBeGreaterThan(freshPenalty + 10);
	});

	it("increases the penalty for words that keep repeating across recent days", () => {
		const singleRepeatPenalty = calculateCandidateFreshnessPenalty(
			["a", "b", "c", "d", "e", "f"],
			["tenir", "sentir"],
			[
				{
					daysAgo: 2,
					letters: ["g", "h", "i", "j", "k", "l"],
					letterSetKey: "ghijkl",
					selectedWordKeys: ["tenir"],
				},
			],
		);

		const frequentRepeatPenalty = calculateCandidateFreshnessPenalty(
			["a", "b", "c", "d", "e", "f"],
			["tenir", "sentir"],
			[
				{
					daysAgo: 1,
					letters: ["g", "h", "i", "j", "k", "l"],
					letterSetKey: "ghijkl",
					selectedWordKeys: ["tenir"],
				},
				{
					daysAgo: 3,
					letters: ["m", "n", "o", "p", "q", "r"],
					letterSetKey: "mnopqr",
					selectedWordKeys: ["tenir", "sentir"],
				},
				{
					daysAgo: 5,
					letters: ["s", "t", "u", "v", "w", "x"],
					letterSetKey: "stuvwx",
					selectedWordKeys: ["tenir"],
				},
			],
		);

		expect(frequentRepeatPenalty).toBeGreaterThan(singleRepeatPenalty);
	});
});
