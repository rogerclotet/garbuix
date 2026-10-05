import dictionary from "@/data/catalan-syllables.json";
import { normalizeWord } from "@/lib/puzzle-text";

const entries = dictionary.map(({ word, syllables }) => ({
	word,
	normalized: normalizeWord(word),
	cells: syllables.map(normalizeWord),
}));

export function getSyllableDictionary(bank: string[]) {
	const allowed = new Set(bank);
	const valid = entries.filter(({ cells }) =>
		cells.every((cell) => allowed.has(cell)),
	);
	return {
		validNormalizedGuesses: [
			...new Set(valid.map(({ normalized }) => normalized)),
		],
		validSyllableGuesses: [
			...new Set(valid.map(({ cells }) => cells.join("|"))),
		],
		displayWords: Object.fromEntries(
			valid.map(({ normalized, word }) => [normalized, word]),
		),
	};
}
