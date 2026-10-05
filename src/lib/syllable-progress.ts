import { applyMiniEvent } from "@/lib/mini-progress";
import { mergeProgressStates } from "@/lib/puzzle-progress";
import type { PuzzleProgressState } from "@/lib/puzzle-types";

export type { MiniEvent as SyllableEvent } from "@/lib/mini-progress";
// The same unlimited, whole-cell hint and completed-game rules as Mini.
export { applyMiniEvent as applySyllableEvent };

export function mergeSyllableProgress(
	existing: PuzzleProgressState | null,
	incoming: PuzzleProgressState,
) {
	const merged = mergeProgressStates(existing, incoming);
	return { ...merged, hintsUsed: merged.hintedCells.length, clueWordIds: [] };
}
