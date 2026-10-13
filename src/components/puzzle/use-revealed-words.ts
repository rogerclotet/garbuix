import { useEffect, useEffectEvent } from "react";
import { createPuzzleEvent, resolveGuess } from "@/lib/puzzle-client";
import { buildCellLetters, getDisplayedSlotWord } from "@/lib/puzzle-helpers";
import type {
	DailyPuzzlePublic,
	GuessAddedEvent,
	PuzzleProgressState,
} from "@/lib/puzzle-types";

// Hints and crossing words can spell a whole word on the board. Guesses it for
// the player, so they do not have to type what is already showing.
export function useRevealedWords({
	puzzle,
	snapshot,
	enabled,
	onFound,
}: {
	puzzle: DailyPuzzlePublic;
	snapshot: {
		progress: PuzzleProgressState;
		answers: Record<number, string>;
		hints: Record<string, string>;
	} | null;
	enabled: boolean;
	onFound: (guesses: GuessAddedEvent[]) => void;
}) {
	const reportFound = useEffectEvent(onFound);

	useEffect(() => {
		if (!enabled || !snapshot) return;
		let cancelled = false;
		const { progress, answers, hints } = snapshot;
		const cellLetters = buildCellLetters(puzzle.wordSlots, answers, hints);
		const spelledWords = puzzle.wordSlots
			.filter((slot) => !progress.guessedWordIds.includes(slot.id))
			.map((slot) => getDisplayedSlotWord(slot, cellLetters))
			// A cell that is still hidden shows as "_".
			.filter((word) => !word.includes("_"));
		Promise.all(
			spelledWords.map((guess) => resolveGuess({ puzzle, progress, guess })),
		)
			.then((guesses) => {
				const found = guesses.filter(({ kind }) => kind === "new_word");
				if (cancelled || found.length === 0) return;
				reportFound(
					found.map((guess) =>
						createPuzzleEvent("guess_added", {
							guessHash: guess.guessHash,
							matchedWordId: guess.matchedSlotId,
							unlockToken: guess.unlockToken,
						}),
					),
				);
			})
			.catch((error: unknown) => {
				// The word stays unfound and the player can still type it.
				console.error("Failed to check revealed words", error);
			});
		return () => {
			cancelled = true;
		};
	}, [enabled, puzzle, snapshot]);
}
