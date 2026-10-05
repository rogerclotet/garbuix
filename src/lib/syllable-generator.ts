import { SYLLABLE_WORDS } from "@/data/syllable-words";
import type { Word } from "@/data/types";
import {
	type CrosswordGrid,
	tryGenerateCrossword,
} from "@/lib/crossword/grid-placement";
import { SeededRandom } from "@/lib/crossword/seeded-random";
import { dateKeyToSeed } from "@/lib/puzzle-dates";
import { normalizeWord } from "@/lib/puzzle-text";
import { SYLLABLE_WORD_COUNT } from "@/lib/syllable-types";

export const SYLLABLE_ALGORITHM_VERSION = "syllables-v1";
const syllablesByWord = new Map(
	SYLLABLE_WORDS.map((cells) => [cells.join(""), cells]),
);
const words: Word[] = [...syllablesByWord.keys()].map((name) => ({
	name,
	areatematica: "Síl·labes",
	frequency: 10_000,
}));

export function getSyllableCells(word: Word): string[] {
	const cells = syllablesByWord.get(word.name);
	if (!cells) throw new Error(`Missing curated syllables for ${word.name}`);
	return cells;
}

export function generateSyllableCrossword(dateKey: string) {
	const random = new SeededRandom(dateKeyToSeed(dateKey) ^ 0x73696c);
	for (let attempt = 0; attempt < 1500; attempt++) {
		const shuffled = random.shuffleArray(words);
		const bank = new Set<string>(
			getSyllableCells(shuffled[0]).map(normalizeWord),
		);
		// Grow a connected vocabulary with at most six distinct input syllables.
		for (const word of shuffled) {
			const cells = getSyllableCells(word).map(normalizeWord);
			if (!cells.some((cell) => bank.has(cell))) continue;
			const union = new Set([...bank, ...cells]);
			if (union.size > 6) continue;
			for (const cell of cells) bank.add(cell);
			if (bank.size === 6) break;
		}
		if (bank.size !== 6) continue;
		const pool = shuffled.filter((word) =>
			getSyllableCells(word).every((cell) => bank.has(normalizeWord(cell))),
		);
		if (pool.length < SYLLABLE_WORD_COUNT) continue;
		const candidate = tryGenerateCrossword(
			pool,
			SYLLABLE_WORD_COUNT,
			SYLLABLE_WORD_COUNT,
			getSyllableCells,
		);
		if (!candidate) continue;
		// The keypad occupies the bottom of a phone. Prefer a wider board so
		// whole syllables stay readable in the space above it.
		const crossword: CrosswordGrid =
			candidate.rows > candidate.cols
				? {
						rows: candidate.cols,
						cols: candidate.rows,
						grid: Array.from({ length: candidate.cols }, (_, col) =>
							candidate.grid.map((row) => row[col]),
						),
						words: candidate.words.map((word) => ({
							...word,
							startRow: word.startCol,
							startCol: word.startRow,
							direction:
								word.direction === "horizontal" ? "vertical" : "horizontal",
						})),
					}
				: candidate;
		const letters = [
			...new Set(
				crossword.words.flatMap(({ word }) =>
					getSyllableCells(word).map(normalizeWord),
				),
			),
		].sort();
		if (letters.length !== 6) continue;
		return {
			crossword,
			letters,
			shuffledLetters: random.shuffleArray(letters),
		};
	}
	throw new Error("Could not generate a five-word syllable puzzle");
}
