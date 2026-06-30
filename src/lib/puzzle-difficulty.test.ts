import { describe, expect, it } from "vitest";
import {
	buildWordFrequencyLookup,
	computeDifficultyForNormalizedWords,
	computePuzzleDifficulty,
	difficultyFromMeanLogFrequency,
	meanLogFrequency,
} from "@/lib/puzzle-difficulty";

describe("puzzle-difficulty", () => {
	it("averages log10 frequencies and clamps below 1", () => {
		expect(meanLogFrequency([100, 100])).toBeCloseTo(2, 5);
		expect(meanLogFrequency([10, 1000])).toBeCloseTo(2, 5);
		expect(meanLogFrequency([0])).toBe(0);
		expect(meanLogFrequency([])).toBe(0);
	});

	it("maps mean log frequency to stars (higher frequency = easier)", () => {
		// Above the easy threshold -> 1 star.
		expect(difficultyFromMeanLogFrequency(4)).toBe(1);
		// Between thresholds -> 2 stars.
		expect(difficultyFromMeanLogFrequency(3.45)).toBe(2);
		// Below the medium threshold -> 3 stars.
		expect(difficultyFromMeanLogFrequency(2.5)).toBe(3);
	});

	it("rarer puzzles score harder than common ones", () => {
		const common = computePuzzleDifficulty([50_000, 80_000, 120_000]);
		const rare = computePuzzleDifficulty([60, 90, 120]);
		expect(common).toBe(1);
		expect(rare).toBe(3);
		expect((rare as number) > (common as number)).toBe(true);
	});

	it("returns null when there is nothing to score", () => {
		expect(computePuzzleDifficulty([])).toBeNull();
	});

	it("looks up normalized words and ignores misses", () => {
		const lookup = buildWordFrequencyLookup([
			{ name: "Pàmpol", areatematica: "Nom", frequency: 80 },
			{ name: "pampol", areatematica: "Nom", frequency: 60 },
			{ name: "casa", areatematica: "Nom", frequency: 90_000 },
		]);
		// Accent/case folded to a single key, keeping the highest frequency.
		expect(lookup.get("pampol")).toBe(80);

		expect(
			computeDifficultyForNormalizedWords(["casa", "absent"], lookup),
		).toBe(1);
		expect(computeDifficultyForNormalizedWords(["absent"], lookup)).toBeNull();
	});
});
