import { useSyncExternalStore } from "react";

// The share action for today's board, published by the Daily page and read by
// the shared header. The header lives above the route outlet and can't reach
// into the game's state, hence this tiny store. null whenever the daily puzzle
// isn't mounted (other routes, SSR, generation), which is also how the header
// knows to hide the share button.

export type DailyHeaderSummary = {
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
