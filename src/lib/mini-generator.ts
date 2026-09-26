import { MINI_WORDS } from "@/data/mini-words";
import type { Word } from "@/data/types";
import { SeededRandom, tryGenerateCrossword } from "@/lib/crossword-generator";
import { dateKeyToSeed } from "@/lib/puzzle-dates";
import { normalizeWord } from "@/lib/puzzle-text";

export const MINI_ALGORITHM_VERSION = "mini-v1";
export const MINI_WORD_COUNT = 5;

const words: Word[] = [
	...new Map(
		MINI_WORDS.map((name) => [
			normalizeWord(name),
			{
				name,
				areatematica: "Mini",
				frequency: 10_000,
			},
		]),
	).values(),
];

// Each keyboard has at most six letters, as in Garbuix. Build candidate pools
// once, then shuffle them by date so every player receives the same board.
let pools: Word[][] | undefined;
function getPools() {
	if (pools) return pools;
	const sets = new Set<string>();
	for (const left of words) {
		for (const right of words) {
			const letters = [
				...new Set(normalizeWord(left.name + right.name)),
			].sort();
			if (letters.length === 6) sets.add(letters.join(""));
		}
	}
	pools = [...sets]
		.map((letters) =>
			words.filter((word) =>
				[...normalizeWord(word.name)].every((letter) =>
					letters.includes(letter),
				),
			),
		)
		.filter(
			(pool) =>
				pool.length >= MINI_WORD_COUNT &&
				pool.some((word) => word.name.length === 3),
		);
	return pools;
}

export function generateMiniCrossword(dateKey: string) {
	const random = new SeededRandom(dateKeyToSeed(dateKey) ^ 0x6d696e69);
	for (const pool of random.shuffleArray(getPools())) {
		const crossword = tryGenerateCrossword(
			random.shuffleArray(pool),
			MINI_WORD_COUNT,
			MINI_WORD_COUNT,
		);
		if (!crossword?.words.some(({ word }) => word.name.length === 3)) continue;
		const letters = [
			...new Set(
				crossword.words.flatMap(({ word }) => [...normalizeWord(word.name)]),
			),
		].sort();
		return {
			crossword,
			letters,
			shuffledLetters: random.shuffleArray(letters),
		};
	}
	throw new Error("Could not generate a five-word Mini puzzle");
}
