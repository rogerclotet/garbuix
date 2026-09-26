import { buildRevealedCells } from "@/components/daily/daily-helpers";
import { applyPuzzleEvent, mergeProgressStates } from "@/lib/puzzle-progress";
import type {
	DailyPuzzlePublic,
	PuzzleClientEvent,
	PuzzleProgressState,
} from "@/lib/puzzle-types";

export type MiniEvent = Extract<
	PuzzleClientEvent,
	{ type: "guess_added" | "hint_used" | "letters_shuffled" }
>;

export function applyMiniEvent(
	puzzle: DailyPuzzlePublic,
	state: PuzzleProgressState,
	event: MiniEvent,
): PuzzleProgressState {
	if (state.completedAt) return state;
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

export function mergeMiniProgress(
	existing: PuzzleProgressState | null,
	incoming: PuzzleProgressState,
) {
	const merged = mergeProgressStates(existing, incoming);
	return {
		...merged,
		hintsUsed: merged.hintedCells.length,
		clueWordIds: [],
		bonusWordsFound: 0,
	};
}
