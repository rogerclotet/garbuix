import { describe, expect, it } from "vitest";
import {
	availableWordCountPenalty,
	buildWordFrequencyLookup,
	computeDifficultyForNormalizedWords,
	computePuzzleDifficulty,
	difficultyFromScore,
	meanLogFrequency,
} from "@/lib/puzzle-difficulty";

describe("puzzle-difficulty", () => {
	it("averages log10 frequencies and clamps below 1", () => {
		expect(meanLogFrequency([100, 100])).toBeCloseTo(2, 5);
		expect(meanLogFrequency([10, 1000])).toBeCloseTo(2, 5);
		expect(meanLogFrequency([0])).toBe(0);
		expect(meanLogFrequency([])).toBe(0);
	});

	it("maps scores to levels with inclusive thresholds", () => {
		expect(difficultyFromScore(4)).toBe(1);
		expect(difficultyFromScore(3.59)).toBe(1);
		expect(difficultyFromScore(3.589)).toBe(2);
		expect(difficultyFromScore(3.3)).toBe(2);
		expect(difficultyFromScore(3.299)).toBe(3);
	});

	it("increases the penalty with valid guesses and caps its effect", () => {
		expect(availableWordCountPenalty(0)).toBe(0);
		expect(availableWordCountPenalty(30)).toBe(0);
		expect(availableWordCountPenalty(60)).toBeCloseTo(0.05);
		expect(availableWordCountPenalty(120)).toBeCloseTo(0.1);
		expect(availableWordCountPenalty(240)).toBe(0.15);
		expect(availableWordCountPenalty(10_000)).toBe(0.15);
	});

	it.each([
		{ frequency: 4_000, smallPoolDifficulty: 1, largePoolDifficulty: 2 },
		{ frequency: 2_200, smallPoolDifficulty: 2, largePoolDifficulty: 3 },
	])(
		"raises borderline ratings when more words are available: $frequency",
		({ frequency, smallPoolDifficulty, largePoolDifficulty }) => {
			expect(
				computePuzzleDifficulty({
					frequencies: [frequency],
					availableWordCount: 30,
				}),
			).toBe(smallPoolDifficulty);
			expect(
				computePuzzleDifficulty({
					frequencies: [frequency],
					availableWordCount: 120,
				}),
			).toBe(largePoolDifficulty);
		},
	);

	it("keeps rarity dominant even at opposite word-count extremes", () => {
		expect(
			computePuzzleDifficulty({
				frequencies: [50_000, 80_000, 120_000],
				availableWordCount: 10_000,
			}),
		).toBe(1);
		expect(
			computePuzzleDifficulty({
				frequencies: [60, 90, 120],
				availableWordCount: 0,
			}),
		).toBe(3);
	});

	it("never lowers difficulty or raises it by more than one level", () => {
		for (const mean of [2, 3.2, 3.3, 3.4, 3.59, 3.65, 3.8, 5]) {
			const baseline = difficultyFromScore(mean);
			let previous = baseline;
			for (const availableWordCount of [0, 30, 60, 120, 240, 10_000]) {
				const difficulty = computePuzzleDifficulty({
					frequencies: [10 ** mean],
					availableWordCount,
				});
				expect(difficulty).not.toBeNull();
				if (difficulty === null) throw new Error("Expected a scorable puzzle");
				expect(difficulty).toBeGreaterThanOrEqual(previous);
				expect(difficulty - baseline).toBeLessThanOrEqual(1);
				previous = difficulty;
			}
		}
	});

	it("returns null when there is nothing to score, even with many guesses", () => {
		expect(
			computePuzzleDifficulty({
				frequencies: [],
				availableWordCount: 240,
			}),
		).toBeNull();
	});

	it("looks up normalized words, ignores misses, and uses the same modifier", () => {
		const lookup = buildWordFrequencyLookup([
			{ name: "Pàmpol", areatematica: "Nom", frequency: 80 },
			{ name: "pampol", areatematica: "Nom", frequency: 60 },
			{ name: "casa", areatematica: "Nom", frequency: 4_000 },
		]);
		expect(lookup.get("pampol")).toBe(80);

		for (const availableWordCount of [30, 120]) {
			expect(
				computeDifficultyForNormalizedWords({
					normalizedWords: ["casa", "absent"],
					frequencyLookup: lookup,
					availableWordCount,
				}),
			).toBe(
				computePuzzleDifficulty({
					frequencies: [4_000],
					availableWordCount,
				}),
			);
		}
		expect(
			computeDifficultyForNormalizedWords({
				normalizedWords: ["absent"],
				frequencyLookup: lookup,
				availableWordCount: 240,
			}),
		).toBeNull();
	});
});
