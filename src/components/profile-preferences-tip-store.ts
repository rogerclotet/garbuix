import { useSyncExternalStore } from "react";

let open = false;
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

export function openProfilePreferencesTip() {
	if (open) return;
	open = true;
	emit();
}

export function closeProfilePreferencesTip() {
	if (!open) return;
	open = false;
	emit();
}

export function setProfilePreferencesTipOpen(next: boolean) {
	if (open === next) return;
	open = next;
	emit();
}

export function useProfilePreferencesTipOpen(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => open,
		() => false,
	);
}
