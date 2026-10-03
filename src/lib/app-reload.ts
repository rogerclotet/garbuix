import { useIsomorphicLayoutEffect } from "@/lib/use-isomorphic-layout-effect";

const saveCheckpoints = new Set<() => void>();

// Each mounted game supplies a synchronous, durable checkpoint. Throwing keeps
// the current document alive if storage is unavailable or hydration is pending.
export function useBeforeAppReload(save: () => void) {
	useIsomorphicLayoutEffect(() => {
		saveCheckpoints.add(save);
		return () => {
			saveCheckpoints.delete(save);
		};
	}, [save]);
}

export function prepareAppReload() {
	// Checkpoints include local input synchronously, even before React commits it.
	for (const save of saveCheckpoints) save();
}
