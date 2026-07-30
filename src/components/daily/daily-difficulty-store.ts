import { useSyncExternalStore } from "react";
import type { PuzzleDifficulty } from "@/lib/puzzle-difficulty";

// Today's puzzle difficulty, published by the Daily page and read by the shared
// header so the indicator can sit next to the "Garbuix!" title. null whenever
// the daily puzzle isn't mounted (other routes, SSR, generation), so the header
// simply omits it.
let difficulty: PuzzleDifficulty | null = null;
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function setDailyDifficulty(next: PuzzleDifficulty | null) {
	if (difficulty === next) return;
	difficulty = next;
	emit();
}

export function useDailyDifficulty(): PuzzleDifficulty | null {
	return useSyncExternalStore(
		subscribe,
		() => difficulty,
		() => null,
	);
}
