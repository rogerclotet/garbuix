import {
	createContext,
	type PropsWithChildren,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type {
	ClueRequest,
	ClueRequestStreamEvent,
	ClueResponse,
} from "@/lib/clue-request-types";

type ClueRequestsStatus = "idle" | "connecting" | "open" | "error" | "closed";

export type RespondResult = { ok: true } | { ok: false; reason: string | null };

type ClueRequestsContextValue = {
	dateKey: string | null;
	incomingRequests: ClueRequest[];
	// Clues delivered to this user, keyed by word id (live + replayed snapshot).
	receivedClues: Record<number, ClueResponse>;
	// Words this user has asked other players for help with (awaiting a reply).
	// Seeded from the snapshot's own-requests replay so a reload keeps showing
	// the "waiting for help" state while the request is still pending server-side.
	requestedHelpWordIds: number[];
	status: ClueRequestsStatus;
	enabled: boolean;
	subscribe(listener: (event: ClueRequestStreamEvent) => void): () => void;
	requestClue(wordId: number): Promise<boolean>;
	respondToClue(requestId: string, text: string): Promise<RespondResult>;
	resolveClue(wordId: number): Promise<void>;
	// The puzzle page publishes which words this user has solved. Requests for
	// unsolved words are filtered out of incomingRequests everywhere (badge +
	// list), since you can't give a useful clue for a word you haven't found.
	publishSolvedWordIds(wordIds: number[]): void;
};

const noop = () => {};

const defaultValue: ClueRequestsContextValue = {
	dateKey: null,
	incomingRequests: [],
	receivedClues: {},
	requestedHelpWordIds: [],
	status: "idle",
	enabled: false,
	subscribe: () => noop,
	requestClue: async () => false,
	respondToClue: async () => ({ ok: false, reason: null }),
	resolveClue: async () => {},
	publishSolvedWordIds: noop,
};

const ClueRequestsContext =
	createContext<ClueRequestsContextValue>(defaultValue);

export type ClueRequestsProviderProps = PropsWithChildren<{
	dateKey: string | null;
	localUserId: string | null;
	enabled?: boolean;
}>;

export function ClueRequestsProvider({
	dateKey,
	localUserId,
	enabled = true,
	children,
}: ClueRequestsProviderProps) {
	const [incomingRequests, setIncomingRequests] = useState<ClueRequest[]>([]);
	const [receivedClues, setReceivedClues] = useState<
		Record<number, ClueResponse>
	>({});
	// Words this user asked help for. Added optimistically on request, restored
	// from the snapshot's own-requests replay on (re)connect, dropped on resolve.
	const [requestedHelpWordIds, setRequestedHelpWordIds] = useState<number[]>(
		[],
	);
	// Requests this user has already answered, hidden from the badge/list so the
	// count reflects only outstanding requests they could still help with.
	const [respondedRequestIds, setRespondedRequestIds] = useState<string[]>([]);
	// Words this user has solved, published by the puzzle page. Used to hide
	// requests for words still unsolved on their own board.
	const [solvedWordIds, setSolvedWordIds] = useState<number[]>([]);
	const solvedWordIdsRef = useRef<number[]>([]);
	const [status, setStatus] = useState<ClueRequestsStatus>("idle");
	const listenersRef = useRef<Set<(event: ClueRequestStreamEvent) => void>>(
		new Set(),
	);
	// Clues we've already surfaced to listeners (toasts), keyed by word + delivery
	// time. Persisted to localStorage so a clue notifies exactly once across the
	// snapshot replay, SSE reconnects, polls, and full page reloads — the snapshot
	// re-sends every inbox clue (24h TTL) on every connect, so without this a reload
	// would re-toast clues already seen.
	const notifiedClueKeysRef = useRef<Set<string>>(new Set());

	const active = enabled && dateKey != null && localUserId != null;

	// Per-user, per-day so a clue's notified-state doesn't leak across accounts on a
	// shared browser or across days (the inbox is scoped to the day too).
	const notifiedStorageKey =
		dateKey && localUserId ? `clue-notified:${localUserId}:${dateKey}` : null;

	// Hydrate the seen-set from localStorage before any clue is ingested. The
	// snapshot/poll only deliver clues after a network round-trip, well after this
	// synchronous load runs on mount.
	useEffect(() => {
		if (!notifiedStorageKey || typeof window === "undefined") {
			return;
		}
		try {
			const raw = window.localStorage.getItem(notifiedStorageKey);
			notifiedClueKeysRef.current = new Set(
				raw ? (JSON.parse(raw) as string[]) : [],
			);
		} catch {
			notifiedClueKeysRef.current = new Set();
		}
	}, [notifiedStorageKey]);

	// Merge delivered clues from any path (snapshot on open, live event, or the
	// polling fallback) into state, and notify listeners once per clue so a clue
	// surfaces the same way whether it arrives while playing or on opening the game.
	const ingestResponses = useCallback(
		(responses: ClueResponse[]) => {
			if (responses.length === 0) {
				return;
			}
			// Display state merges every clue unconditionally: the notified-set only
			// gates toasts. After a reload the replayed inbox clues were all notified
			// in the previous session, but they still need to render under the words.
			setReceivedClues((current) => {
				let changed = false;
				const next = { ...current };
				for (const response of responses) {
					const existing = next[response.wordId];
					if (existing?.at === response.at) {
						continue;
					}
					next[response.wordId] = response;
					changed = true;
				}
				// Identity-stable when nothing changed so the 8s inbox poll doesn't
				// re-render consumers with an equal-but-new object.
				return changed ? next : current;
			});
			const fresh = responses.filter(
				(r) => !notifiedClueKeysRef.current.has(`${r.wordId}:${r.at}`),
			);
			if (fresh.length === 0) {
				return;
			}
			for (const response of fresh) {
				notifiedClueKeysRef.current.add(`${response.wordId}:${response.at}`);
			}
			if (notifiedStorageKey && typeof window !== "undefined") {
				try {
					window.localStorage.setItem(
						notifiedStorageKey,
						JSON.stringify([...notifiedClueKeysRef.current]),
					);
				} catch {
					// best-effort; persistence is an enhancement, display still works
				}
			}
			for (const listener of listenersRef.current) {
				for (const response of fresh) {
					listener({ type: "response", response });
				}
			}
		},
		[notifiedStorageKey],
	);

	useEffect(() => {
		if (!active || typeof window === "undefined") {
			return;
		}

		setStatus("connecting");
		const source = new EventSource(`/api/clue-requests/${dateKey}/stream`);

		const handleSnapshot = (event: MessageEvent) => {
			try {
				const snapshot = JSON.parse(event.data) as {
					requests?: ClueRequest[];
					ownRequests?: ClueRequest[];
					responses?: ClueResponse[];
				};
				setIncomingRequests(snapshot.requests ?? []);
				// Restore this user's own still-pending requests so a reload keeps
				// the "waiting for help" state. Merged (not replaced) so a reconnect
				// can't wipe an optimistic request that's still in flight.
				const ownWordIds = (snapshot.ownRequests ?? []).map((r) => r.wordId);
				if (ownWordIds.length > 0) {
					setRequestedHelpWordIds((current) => {
						const merged = ownWordIds.filter((id) => !current.includes(id));
						return merged.length > 0 ? [...current, ...merged] : current;
					});
				}
				// Replay delivered clues so opening the game (or recovering a dropped
				// live event) notifies of clues left while away. ingestResponses
				// dedupes, so a reconnect within the session won't re-notify.
				ingestResponses(snapshot.responses ?? []);
				setStatus("open");
			} catch {
				// ignore
			}
		};

		const handleMessage = (event: MessageEvent) => {
			try {
				const payload = JSON.parse(event.data) as ClueRequestStreamEvent;
				if (payload.type === "request") {
					// The broadcast reaches the asker too; never surface their own
					// request back to them as something to answer.
					if (payload.request.requesterId === localUserId) {
						return;
					}
					setIncomingRequests((current) =>
						current.some((r) => r.id === payload.request.id)
							? current
							: [...current, payload.request],
					);
				} else if (payload.type === "resolved") {
					// Helped by someone else or no longer needed — drop it everywhere.
					setIncomingRequests((current) =>
						current.filter((r) => r.id !== payload.requestId),
					);
				} else if (payload.type === "response") {
					// ingestResponses handles state + deduped listener notification.
					ingestResponses([payload.response]);
					return;
				}
				for (const listener of listenersRef.current) {
					listener(payload);
				}
			} catch {
				// ignore
			}
		};

		source.addEventListener("snapshot", handleSnapshot);
		source.addEventListener("message", handleMessage);
		source.onerror = () => setStatus("error");
		source.onopen = () => setStatus("open");

		return () => {
			source.removeEventListener("snapshot", handleSnapshot);
			source.removeEventListener("message", handleMessage);
			source.close();
			setStatus("closed");
		};
	}, [active, dateKey, localUserId, ingestResponses]);

	// Reconcile the set of requests we could answer against the server's
	// authoritative pending set (delivered by the snapshot and the inbox poll).
	// Mirrors how the snapshot replaces incomingRequests, so a missed live
	// "request" event (added) or "resolved" event (dropped) self-heals — the
	// asker's clue request shows up for responders even when the proxy ate the
	// live event. Own requests are filtered server-side; we re-filter defensively.
	const reconcileIncomingRequests = useCallback(
		(serverRequests: ClueRequest[]) => {
			setIncomingRequests((current) => {
				const next = serverRequests.filter(
					(r) => r.requesterId !== localUserId,
				);
				// Identity-stable when the id-set is unchanged, so the 8s poll doesn't
				// re-render consumers with an equal-but-new array.
				const currentIds = new Set(current.map((r) => r.id));
				const unchanged =
					next.length === current.length &&
					next.every((r) => currentIds.has(r.id));
				return unchanged ? current : next;
			});
		},
		[localUserId],
	);

	// Polling fallback for both directions: the live SSE event can be dropped (a
	// proxy buffering the open stream in production), so the asker would otherwise
	// wait forever and responders would never see the request. Every few seconds we
	// merge the inbox (clues for us) and reconcile the pending requests (clues we
	// could give). ingestResponses dedupes, so a clue notifies exactly once.
	useEffect(() => {
		if (!active || !dateKey || typeof window === "undefined") {
			return;
		}

		let cancelled = false;

		const pollInbox = async () => {
			try {
				const response = await fetch(`/api/clue-requests/${dateKey}/inbox`);
				if (!response.ok) return;
				const data = (await response.json()) as {
					responses?: ClueResponse[];
					requests?: ClueRequest[];
				};
				if (cancelled) return;
				if (data.requests) {
					reconcileIncomingRequests(data.requests);
				}
				if (data.responses && data.responses.length > 0) {
					ingestResponses(data.responses);
				}
			} catch {
				// best-effort; the SSE path or the next poll will recover
			}
		};

		const interval = window.setInterval(pollInbox, 8000);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [active, dateKey, ingestResponses, reconcileIncomingRequests]);

	const subscribe = useCallback(
		(listener: (event: ClueRequestStreamEvent) => void) => {
			listenersRef.current.add(listener);
			return () => {
				listenersRef.current.delete(listener);
			};
		},
		[],
	);

	const requestClue = useCallback(
		async (wordId: number): Promise<boolean> => {
			if (!dateKey) return false;
			// Optimistic so the button flips to "waiting" immediately; rolled back
			// below if the server couldn't register the request.
			setRequestedHelpWordIds((current) =>
				current.includes(wordId) ? current : [...current, wordId],
			);
			const rollback = () =>
				setRequestedHelpWordIds((current) =>
					current.filter((id) => id !== wordId),
				);
			try {
				const response = await fetch(`/api/clue-requests/${dateKey}/request`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ wordId }),
				});
				if (!response.ok) {
					rollback();
					return false;
				}
				const data = (await response.json()) as {
					created?: boolean;
					reason?: string;
				};
				// "duplicate" means an earlier request for this word is still pending
				// server-side (e.g. re-asking after a reload), so the waiting state is
				// accurate — keep it and report success.
				const pendingOnServer =
					Boolean(data.created) || data.reason === "duplicate";
				if (!pendingOnServer) {
					rollback();
				}
				return pendingOnServer;
			} catch {
				rollback();
				return false;
			}
		},
		[dateKey],
	);

	const respondToClue = useCallback(
		async (requestId: string, text: string): Promise<RespondResult> => {
			if (!dateKey) return { ok: false, reason: null };
			try {
				const response = await fetch(`/api/clue-requests/${dateKey}/respond`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ requestId, text }),
				});
				if (response.ok) {
					setRespondedRequestIds((current) =>
						current.includes(requestId) ? current : [...current, requestId],
					);
					return { ok: true };
				}
				let reason: string | null = null;
				try {
					const data = (await response.json()) as { reason?: string };
					reason = data.reason ?? null;
				} catch {
					reason = null;
				}
				return { ok: false, reason };
			} catch {
				return { ok: false, reason: null };
			}
		},
		[dateKey],
	);

	const resolveClue = useCallback(
		async (wordId: number): Promise<void> => {
			if (!dateKey) return;
			// The asker no longer needs help (found the word) — clear the local
			// waiting state regardless of whether the server call lands.
			setRequestedHelpWordIds((current) =>
				current.filter((id) => id !== wordId),
			);
			try {
				await fetch(`/api/clue-requests/${dateKey}/resolve`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ wordId }),
				});
			} catch {
				// best-effort; the request expires on its own otherwise
			}
		},
		[dateKey],
	);

	// Stable identity unless the actual set of solved words changes, so the puzzle
	// page can hand us a fresh array every render without churning consumers.
	const publishSolvedWordIds = useCallback((wordIds: number[]) => {
		const sorted = [...wordIds].sort((a, b) => a - b);
		const prev = solvedWordIdsRef.current;
		if (
			prev.length === sorted.length &&
			prev.every((id, i) => id === sorted[i])
		) {
			return;
		}
		solvedWordIdsRef.current = sorted;
		setSolvedWordIds(sorted);
	}, []);

	const visibleRequests = useMemo(() => {
		const solved = new Set(solvedWordIds);
		return incomingRequests.filter(
			(r) => !respondedRequestIds.includes(r.id) && solved.has(r.wordId),
		);
	}, [incomingRequests, respondedRequestIds, solvedWordIds]);

	const value = useMemo<ClueRequestsContextValue>(
		() => ({
			dateKey,
			incomingRequests: visibleRequests,
			receivedClues,
			requestedHelpWordIds,
			status,
			enabled: active,
			subscribe,
			requestClue,
			respondToClue,
			resolveClue,
			publishSolvedWordIds,
		}),
		[
			dateKey,
			visibleRequests,
			receivedClues,
			requestedHelpWordIds,
			status,
			active,
			subscribe,
			requestClue,
			respondToClue,
			resolveClue,
			publishSolvedWordIds,
		],
	);

	return (
		<ClueRequestsContext.Provider value={value}>
			{children}
		</ClueRequestsContext.Provider>
	);
}

export function useClueRequests(): ClueRequestsContextValue {
	return useContext(ClueRequestsContext);
}
