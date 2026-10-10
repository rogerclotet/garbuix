import { useSyncExternalStore } from "react";

export type BooleanStore = {
	open: () => void;
	close: () => void;
	set: (next: boolean) => void;
	useValue: () => boolean;
};

// A module-level on/off flag any component can flip or subscribe to, for
// dialogs that are opened from places far from where they render.
export function createBooleanStore(): BooleanStore {
	let value = false;
	const listeners = new Set<() => void>();

	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};

	const set = (next: boolean) => {
		if (value === next) return;
		value = next;
		for (const listener of listeners) listener();
	};

	return {
		open: () => set(true),
		close: () => set(false),
		set,
		useValue: () =>
			useSyncExternalStore(
				subscribe,
				() => value,
				() => false,
			),
	};
}
