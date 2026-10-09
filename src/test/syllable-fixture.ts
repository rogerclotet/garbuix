import { buildPuzzleSnapshots } from "@/lib/puzzle-snapshot";
import { getSyllableDictionary } from "@/lib/syllable-dictionary.server";
import {
	generateSyllableCrossword,
	getSyllableCells,
	SYLLABLE_ALGORITHM_VERSION,
} from "@/lib/syllable-generator";

export async function syllableFixture(dateKey = "2026-10-04") {
	const generated = generateSyllableCrossword(dateKey);
	const { publicSnapshot, privateSnapshot } = await buildPuzzleSnapshots({
		...generated,
		initialShuffledLetters: generated.shuffledLetters,
		dateKey,
		seed: 261004,
		puzzleId: `syllable:${dateKey}`,
		algorithmVersion: SYLLABLE_ALGORITHM_VERSION,
		getCells: getSyllableCells,
	});
	return {
		puzzle: {
			...publicSnapshot,
			...getSyllableDictionary(generated.letters),
		},
		privateSnapshot,
		crossword: generated.crossword,
	};
}
