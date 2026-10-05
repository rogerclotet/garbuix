import dictionary from "@/data/catalan-syllable-words.json";
import { MINI_WORDS } from "@/data/mini-words";
import { isMiniWordLength } from "@/lib/mini-rules";
import { getValidNormalizedGuessesForLetters } from "@/lib/puzzle-dictionary";
import { normalizeWord } from "@/lib/puzzle-text";

// This Softcatalà source includes the three-letter words omitted by the
// regular game's dictionary. Prefer familiar Mini spellings when accents vary.
const spellings = new Map<string, string>();
for (const word of [...MINI_WORDS, ...dictionary]) {
	const normalized = normalizeWord(word);
	if (isMiniWordLength(normalized.length) && !spellings.has(normalized)) {
		spellings.set(normalized, word);
	}
}
const normalizedWords = [...spellings.keys()].sort();

export function getMiniDictionary(letters: readonly string[]) {
	const validNormalizedGuesses = getValidNormalizedGuessesForLetters(
		normalizedWords,
		letters,
	);
	return {
		validNormalizedGuesses,
		displayWords: Object.fromEntries(
			validNormalizedGuesses.map((word) => [word, spellings.get(word) ?? word]),
		),
	};
}
