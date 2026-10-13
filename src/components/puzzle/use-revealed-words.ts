import { useEffect, useEffectEvent } from "react";
import { findFullyRevealedWords, type RevealedWord } from "@/lib/puzzle-client";
import { buildCellLetters } from "@/lib/puzzle-helpers";
import type {
	DailyPuzzlePublic,
	PuzzleProgressState,
} from "@/lib/puzzle-types";

// Reports words that hints and crossing words have fully spelled on the board,
// so the player does not have to type what is already showing.
export function useRevealedWords({
	puzzle,
	snapshot,
	enabled,
	onRevealed,
}: {
	puzzle: DailyPuzzlePublic;
	snapshot: {
		progress: PuzzleProgressState;
		answers: Record<number, string>;
		hints: Record<string, string>;
	} | null;
	enabled: boolean;
	onRevealed: (words: RevealedWord[]) => void;
}) {
	const reportRevealed = useEffectEvent(onRevealed);

	useEffect(() => {
		if (!enabled || !snapshot) return;
		let cancelled = false;
		findFullyRevealedWords(
			puzzle,
			snapshot.progress.guessedWordIds,
			buildCellLetters(puzzle.wordSlots, snapshot.answers, snapshot.hints),
		)
			.then((words) => {
				if (!cancelled && words.length > 0) reportRevealed(words);
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
