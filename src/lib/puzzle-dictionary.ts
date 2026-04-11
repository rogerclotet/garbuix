import type { Word } from "@/data/types";
import { normalizeWord } from "@/lib/puzzle-text";

export function buildNormalizedDictionary(words: Word[]): string[] {
	const normalizedWords = new Set<string>();

	for (const word of words) {
		const normalizedWord = normalizeWord(word.name);
		if (normalizedWord.length < 4) {
			continue;
		}

		normalizedWords.add(normalizedWord);
	}

	return [...normalizedWords].sort();
}

export function getValidNormalizedGuessesForLetters(
	normalizedWords: readonly string[],
	letters: readonly string[],
): string[] {
	const allowedLetters = new Set(letters);

	return normalizedWords.filter((word) => {
		for (const letter of word) {
			if (!allowedLetters.has(letter)) {
				return false;
			}
		}

		return true;
	});
}
