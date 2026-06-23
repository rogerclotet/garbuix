import { describe, expect, it } from "vitest";
import {
	buildNormalizedDictionary,
	getValidNormalizedGuessesForLetters,
} from "@/lib/puzzle-dictionary";

describe("puzzle-dictionary", () => {
	it("normalizes, deduplicates, and excludes short words", () => {
		const normalizedWords = buildNormalizedDictionary([
			"Còs",
			"Cosa",
			"cósa",
			"col·laborar",
		]);

		expect(normalizedWords).toEqual(["collaborar", "cosa"]);
	});

	it("returns a deterministic, letter-valid subset for the day", () => {
		const normalizedWords = ["cosa", "saco", "soca", "som", "xoc"];

		expect(
			getValidNormalizedGuessesForLetters(normalizedWords, [
				"c",
				"o",
				"s",
				"a",
			]),
		).toEqual(["cosa", "saco", "soca"]);
		expect(
			getValidNormalizedGuessesForLetters(normalizedWords, [
				"a",
				"s",
				"o",
				"c",
			]),
		).toEqual(["cosa", "saco", "soca"]);
	});
});
