import type { RevealedWord } from "@/lib/puzzle-client";
import { buildRevealedCells } from "@/lib/puzzle-helpers";
import { applyPuzzleEvent, mergeProgressStates } from "@/lib/puzzle-progress";
import type {
	DailyPuzzlePublic,
	PuzzleClientEvent,
	PuzzleProgressState,
} from "@/lib/puzzle-types";

// Hints and crossing words filled in every cell of these words. The player
// submitted nothing, so they count as found without adding a try.
export type WordsRevealedEvent = {
	type: "words_revealed";
	at: string;
	payload: { words: RevealedWord[] };
};

export type MiniEvent =
	| Extract<
			PuzzleClientEvent,
			{ type: "guess_added" | "hint_used" | "letters_shuffled" }
	  >
	| WordsRevealedEvent;

export function createWordsRevealedEvent(
	words: RevealedWord[],
): WordsRevealedEvent {
	return {
		type: "words_revealed",
		at: new Date().toISOString(),
		payload: { words },
	};
}

export function applyMiniEvent(
	puzzle: DailyPuzzlePublic,
	state: PuzzleProgressState,
	event: MiniEvent,
): PuzzleProgressState {
	if (state.completedAt) return state;
	if (event.type === "words_revealed")
		return applyWordsRevealed(puzzle, state, event);
	if (event.type !== "hint_used")
		return applyPuzzleEvent(state, event, puzzle.wordSlots.length);
	const cellKey = event.payload.cellKey;
	if (
		buildRevealedCells(puzzle, state).has(cellKey) ||
		!puzzle.hintCapsules.some((capsule) => capsule.cellKey === cellKey)
	)
		return state;
	return {
		...state,
		hintedCells: [...state.hintedCells, cellKey],
		hintsUsed: state.hintsUsed + 1,
	};
}

function applyWordsRevealed(
	puzzle: DailyPuzzlePublic,
	state: PuzzleProgressState,
	event: WordsRevealedEvent,
): PuzzleProgressState {
	const words = event.payload.words.filter(
		({ wordId }) =>
			!state.guessedWordIds.includes(wordId) &&
			puzzle.wordSlots.some((slot) => slot.id === wordId),
	);
	if (words.length === 0) return state;
	const guessedWordIds = [
		...state.guessedWordIds,
		...words.map(({ wordId }) => wordId),
	];
	return {
		...state,
		guessedWordIds,
		revealedWordTokens: {
			...state.revealedWordTokens,
			...Object.fromEntries(
				words.map(({ wordId, unlockToken }) => [String(wordId), unlockToken]),
			),
		},
		completedAt:
			guessedWordIds.length >= puzzle.wordSlots.length ? event.at : null,
	};
}

export function mergeMiniProgress(
	existing: PuzzleProgressState | null,
	incoming: PuzzleProgressState,
) {
	const merged = mergeProgressStates(existing, incoming);
	return {
		...merged,
		hintsUsed: merged.hintedCells.length,
		clueWordIds: [],
	};
}
