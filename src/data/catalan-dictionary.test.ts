import { describe, expect, it } from "vitest";
import guessWords from "@/data/catalan-guess-words.json";
import syllableWords from "@/data/catalan-syllable-words.json";
import generationWords from "@/data/catalan-words.json";

// Common words players have reported missing. Guards the generated lists
// against a parsing change or a Softcatalà update dropping them again.
const COMMON_WORDS = [
	"pau",
	"nit",
	"ordre",
	"pols",
	"coma",
	"còlera",
	"cada",
	"sense",
	"durant",
	"ningú",
	"nosaltres",
	"aquesta",
	"noia",
	"catalana",
	"primera",
	"finalment",
];

describe("generated Catalan dictionary", () => {
	const guesses = new Set(guessWords);
	const allLengths = new Set(syllableWords);

	it("accepts common words", () => {
		for (const word of COMMON_WORDS) {
			expect(allLengths.has(word), word).toBe(true);
			if (word.length >= 4) expect(guesses.has(word), word).toBe(true);
		}
	});

	it("leaves out plurals, verb forms and interjections", () => {
		for (const word of ["cases", "catalans", "menjo", "hola"]) {
			expect(allLengths.has(word), word).toBe(false);
		}
	});

	it("generates puzzles from open-class headwords", () => {
		const names = new Set(generationWords.map((word) => word.name));
		for (const word of ["ordre", "vall", "salut"]) {
			expect(names.has(word), word).toBe(true);
		}
		for (const word of ["cada", "sense", "finalment", "petita"]) {
			expect(names.has(word), word).toBe(false);
		}
	});
});
