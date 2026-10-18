import { applyPuzzleEvent, mergeProgressStates } from "@/lib/puzzle-progress";
import type {
	PuzzleClientEvent,
	PuzzleProgressState,
} from "@/lib/puzzle-types";
import type { QuadratPuzzlePublic } from "@/lib/quadrat-types";

// Three clues a day, as in the classic game.
export const QUADRAT_CLUE_LIMIT = 3;

export type QuadratEvent = Extract<
	PuzzleClientEvent,
	{ type: "guess_added" | "text_hint_requested" }
>;

export function applyQuadratEvent(
	puzzle: Pick<QuadratPuzzlePublic, "wordSlots">,
	state: PuzzleProgressState,
	event: QuadratEvent,
): PuzzleProgressState {
	if (state.completedAt) return state;
	if (
		event.type === "text_hint_requested" &&
		(state.guessedWordIds.includes(event.payload.wordId) ||
			!puzzle.wordSlots.some((slot) => slot.id === event.payload.wordId))
	) {
		return state;
	}
	return applyPuzzleEvent(state, event, puzzle.wordSlots.length);
}

// The first three clues asked on any device are the ones that count.
export function mergeQuadratProgress(
	existing: PuzzleProgressState | null,
	incoming: PuzzleProgressState,
): PuzzleProgressState {
	const merged = mergeProgressStates(existing, incoming);
	const clueWordIds = merged.clueWordIds.slice(0, QUADRAT_CLUE_LIMIT);
	return {
		...merged,
		clueWordIds,
		hintsUsed: clueWordIds.length,
		hintedCells: [],
	};
}
