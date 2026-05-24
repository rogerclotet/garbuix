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

export function openHowToPlay() {
	if (open) return;
	open = true;
	emit();
}

export function closeHowToPlay() {
	if (!open) return;
	open = false;
	emit();
}

export function setHowToPlayOpen(next: boolean) {
	if (open === next) return;
	open = next;
	emit();
}

export function useHowToPlayOpen(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => open,
		() => false,
	);
}
