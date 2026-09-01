import { useSyncExternalStore } from "react";

// The leaderboard id of a player with no account. The server mints it and
// returns it alongside the signed guest cookie that proves ownership; the id
// itself is public (it labels the guest's row on every viewer's board), so
// caching it here is only about knowing which row is "you".
//
// Null until the first response that carries one — before that a guest has no
// row on the board, so there is nothing to highlight.

const STORAGE_KEY = "paraules-anon-participant-id-v1";

let participantId: string | null = null;
let hydrated = false;
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

function hydrate() {
	if (hydrated || typeof window === "undefined") {
		return;
	}

	hydrated = true;
	try {
		participantId = window.localStorage.getItem(STORAGE_KEY);
	} catch {
		// private mode, or storage disabled: the id is a convenience only
	}
}

export function getAnonParticipantId(): string | null {
	hydrate();
	return participantId;
}

export function rememberAnonParticipantId(next: string | null | undefined) {
	if (!next) {
		return;
	}

	hydrate();
	if (participantId === next) {
		return;
	}

	participantId = next;
	try {
		window.localStorage.setItem(STORAGE_KEY, next);
	} catch {
		// see hydrate
	}
	emit();
}

export function useAnonParticipantId(): string | null {
	return useSyncExternalStore(
		subscribe,
		() => getAnonParticipantId(),
		() => null,
	);
}
