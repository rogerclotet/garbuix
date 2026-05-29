import { describe, expect, it } from "vitest";
import allWords from "@/data/catalan-words.json";
import {
	calculateCandidateFreshnessPenalty,
	countSameRootPairs,
	type DailyPuzzleHistoryEntry,
	generateDailyCrosswordForSeed,
	normalizeWord,
	wordsShareRoot,
} from "@/lib/crossword-generator";
import { getPlayableWordLetters } from "@/lib/puzzle-text";

function hasConflictingDisplayIntersections(
	result: NonNullable<ReturnType<typeof generateDailyCrosswordForSeed>>,
) {
	const lettersByCell = new Map<string, string>();

	for (const placement of result.crossword.words) {
		const letters = getPlayableWordLetters(placement.word.name);

		for (let index = 0; index < letters.length; index += 1) {
			const row =
				placement.direction === "horizontal"
					? placement.startRow
					: placement.startRow + index;
			const col =
				placement.direction === "horizontal"
					? placement.startCol + index
					: placement.startCol;
			const cellKey = `${row},${col}`;
			const existing = lettersByCell.get(cellKey);
			const letter = letters[index] ?? "";

			if (existing && existing !== letter) {
				return true;
			}

			lettersByCell.set(cellKey, letter);
		}
	}

	return false;
}

describe("wordsShareRoot", () => {
	it("flags morphological siblings", () => {
		const samples: [string, string][] = [
			["instància", "instanciar"],
			["quedar", "quedada"],
			["casa", "casar"],
		];

		for (const [left, right] of samples) {
			expect(wordsShareRoot({ name: left }, { name: right })).toBe(true);
		}
	});

	it("treats distinct roots as unrelated", () => {
		const samples: [string, string][] = [
			["mare", "marca"],
			["casa", "cosa"],
			["taula", "tauró"],
		];

		for (const [left, right] of samples) {
			expect(wordsShareRoot({ name: left }, { name: right })).toBe(false);
		}
	});

	it("counts unordered same-root pairs", () => {
		expect(
			countSameRootPairs([
				{ name: "quedar" },
				{ name: "quedada" },
				{ name: "taula" },
			]),
		).toBe(1);
		expect(countSameRootPairs([{ name: "mare" }, { name: "casa" }])).toBe(0);
	});
});

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

	it("does not include duplicate normalized answers in the same daily puzzle", {
		timeout: 60_000,
	}, () => {
		const result = generateDailyCrosswordForSeed(allWords, 260401);

		expect(result).not.toBeNull();

		const crossword = result?.crossword;

		expect(crossword).toBeDefined();
		if (!crossword) {
			throw new Error("Expected crossword to be generated");
		}

		const normalizedWords = crossword.words.map((placement) =>
			normalizeWord(placement.word.name),
		);

		expect(new Set(normalizedWords).size).toBe(normalizedWords.length);
		expect(crossword.words.map((placement) => placement.word.name)).not.toEqual(
			expect.arrayContaining(["consol", "cònsol"]),
		);
	});

	it("does not place multiple words sharing a root in the same puzzle", {
		timeout: 120_000,
	}, () => {
		const cache = new Map();
		for (const seed of [260401, 260405, 260411]) {
			const result = generateDailyCrosswordForSeed(allWords, seed, 10, 15, {
				cache,
			});

			expect(result).not.toBeNull();
			if (!result) {
				throw new Error(`Expected crossword for seed ${seed}`);
			}

			const placedWords = result.crossword.words.map(
				(placement) => placement.word,
			);

			expect(countSameRootPairs(placedWords)).toBe(0);
			expect(placedWords.length).toBeGreaterThanOrEqual(10);
			expect(placedWords.length).toBeLessThanOrEqual(15);
		}
	});

	it("avoids crossings that disagree on the displayed accent for a shared cell", {
		timeout: 60_000,
	}, () => {
		const result = generateDailyCrosswordForSeed(allWords, 260411);

		expect(result).not.toBeNull();
		if (!result) {
			throw new Error("Expected crossword to be generated");
		}

		expect(hasConflictingDisplayIntersections(result)).toBe(false);
	});
});
