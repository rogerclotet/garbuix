import guessWords from "@/data/catalan-guess-words.json";
import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import { dateKeyToSeed } from "@/lib/puzzle-dates";
import { buildNormalizedDictionary } from "@/lib/puzzle-dictionary";
import {
	findQuadratValidGuesses,
	generateQuadratPuzzle,
	QUADRAT_ALGORITHM_VERSION,
} from "@/lib/quadrat-generator";
import { buildQuadratSnapshots } from "@/lib/quadrat-snapshot";

export async function quadratFixture(dateKey = "2026-10-05") {
	const seed = dateKeyToSeed(dateKey);
	const generated = generateQuadratPuzzle(allWords as Word[], seed);
	const { publicSnapshot, privateSnapshot } = await buildQuadratSnapshots({
		puzzleId: `quadrat:${dateKey}`,
		dateKey,
		seed,
		algorithmVersion: QUADRAT_ALGORITHM_VERSION,
		generated,
		validNormalizedGuesses: findQuadratValidGuesses({
			letters: generated.letters,
			connections: generated.connections,
			normalizedWords: buildNormalizedDictionary(guessWords),
			targetWords: generated.words.map((word) => word.normalizedWord),
		}),
	});
	return { puzzle: publicSnapshot, privateSnapshot };
}
