import { resolveGuess } from "@/lib/puzzle-client";
import { createGuessHash } from "@/lib/puzzle-crypto";
import { normalizeWord } from "@/lib/puzzle-text";
import type { PuzzleProgressState } from "@/lib/puzzle-types";
import type { SyllablePuzzlePublic } from "@/lib/syllable-types";

export async function resolveSyllableGuess({
	puzzle,
	progress,
	syllables,
}: {
	puzzle: SyllablePuzzlePublic;
	progress: PuzzleProgressState;
	syllables: string[];
}) {
	const cells = syllables.map(normalizeWord);
	const sequence = cells.join("|");
	if (
		!cells.every((cell) => puzzle.letters.includes(cell)) ||
		!puzzle.validSyllableGuesses.includes(sequence)
	) {
		const guessHash = await createGuessHash(puzzle.id, `invalid:${sequence}`);
		return {
			kind: "not_in_dictionary" as const,
			isRepeatGuess: progress.guessHashes.includes(guessHash),
			displayWord: null,
			guessHash,
			normalizedGuess: cells.join(""),
			matchedSlotId: null,
			unlockToken: null,
		};
	}
	return resolveGuess({ puzzle, progress, guess: cells.join("") });
}
