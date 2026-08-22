import { useSyncExternalStore } from "react";

// Today's progress, published by the Daily page and read by the shared header.
// The redesigned header folds the progress ring and the counters into the app
// chrome, so the board gets the whole screen below it — but the header lives
// above the route outlet and can't reach into the game's state, hence this tiny
// store. null whenever the daily puzzle isn't mounted (other routes, SSR,
// generation), so the header falls back to its usual row.

export type DailyHeaderSummary = {
	found: number;
	total: number;
	guessCount: number;
	// Progress inside the current cycle toward the free letter that off-puzzle
	// words earn, and whether that meter is enabled at all.
	bonusInCycle: number;
	bonusTarget: number;
	showBonus: boolean;
	justEarnedBonus: boolean;
	onShare: () => void;
};

let summary: DailyHeaderSummary | null = null;
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

export function setDailyHeaderSummary(next: DailyHeaderSummary | null) {
	summary = next;
	emit();
}

export function useDailyHeaderSummary(): DailyHeaderSummary | null {
	return useSyncExternalStore(
		subscribe,
		() => summary,
		() => null,
	);
}
