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
import { getOrCreateAnonIdentity } from "@/lib/anon-identity";
import { rememberAnonParticipantId } from "@/lib/anon-participant-store";
import type {
	ClueHelpGiven,
	ClueRequest,
	ClueRequestStreamEvent,
	ClueResponse,
} from "@/lib/clue-request-types";
import { clueHelpGivenField, clueSeenMember } from "@/lib/clue-request-types";

function isPageVisible(): boolean {
	return document.visibilityState === "visible";
}

// A guest's identity is the signed cookie the server issued, which the browser
// attaches on its own. All the client still supplies is the display name it
// wants shown next to a request or a delivered clue.
function buildAnonNameBody(): { name: string } {
	return { name: getOrCreateAnonIdentity().name };
}

type ClueRequestsStatus = "idle" | "connecting" | "open" | "error" | "closed";

export type RespondResult = { ok: true } | { ok: false; reason: string | null };

type ClueRequestsContextValue = {
	dateKey: string | null;
	incomingRequests: ClueRequest[];
	// Clues delivered to this user, keyed by word id (live + replayed snapshot).
	receivedClues: Record<number, ClueResponse>;
	// Asker+word pairs this user has already helped (for confirmations after resolve).
	helpGivenRecords: ClueHelpGiven[];
	// Words this user has asked other players for help with (awaiting a reply).
	// Seeded from the snapshot's own-requests replay so a reload keeps showing
	// the "waiting for help" state while the request is still pending server-side.
	requestedHelpWordIds: number[];
	status: ClueRequestsStatus;
	enabled: boolean;
	subscribe(listener: (event: ClueRequestStreamEvent) => void): () => void;
	// hasAiClue tells responders (via the request) whether this player already
	// unlocked the word's AI clue, so copying it back to them adds nothing.
	requestClue(wordId: number, hasAiClue?: boolean): Promise<boolean>;
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
	helpGivenRecords: [],
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

// Marks the player as a guest. Identity itself lives in the signed cookie the
// server issued, so there is nothing credential-like to pass here.
export type AnonClueCredentials = {
	isGuest: true;
};

export type ClueRequestsProviderProps = PropsWithChildren<{
	dateKey: string | null;
	localUserId: string | null;
	anonCredentials?: AnonClueCredentials | null;
	enabled?: boolean;
}>;

export function ClueRequestsProvider({
	dateKey,
	localUserId,
	anonCredentials = null,
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
	// Asker+word pairs this user has already helped, seeded from the snapshot so
	// a reload keeps requests hidden and confirmations visible.
	const [helpGivenRecords, setHelpGivenRecords] = useState<ClueHelpGiven[]>([]);
	const helpGivenKeysRef = useRef<Set<string>>(new Set());
	// Words this user has solved, published by the puzzle page. Used to hide
	// requests for words still unsolved on their own board.
	const [solvedWordIds, setSolvedWordIds] = useState<number[]>([]);
	const solvedWordIdsRef = useRef<number[]>([]);
	const [status, setStatus] = useState<ClueRequestsStatus>("idle");
	const listenersRef = useRef<Set<(event: ClueRequestStreamEvent) => void>>(
		new Set(),
	);
	// Clues already surfaced to listeners (toasts) in this session, keyed by word +
	// delivery time. Across reloads and devices the server's seen-set takes over:
	// the snapshot and poll re-send every inbox clue (24h TTL) flagged `seen` once
	// any device has shown it, so a clue notifies once per player, not per device.
	const notifiedClueKeysRef = useRef<Set<string>>(new Set());

	// Guests supply a name with each write; signed-in players don't.
	const isAnon = anonCredentials != null;

	// A guest's id is minted server-side and arrives on the stream's snapshot, so
	// the connection can't wait for it — only signed-in players are gated on
	// having one.
	const active = enabled && dateKey != null && (isAnon || localUserId != null);

	// Tells the server these clues were shown, so the player's other devices and
	// later reloads don't notify them again.
	const markCluesSeen = useCallback(
		(responses: ClueResponse[]) => {
			if (!dateKey) return;
			void fetch(`/api/clue-requests/${dateKey}/seen`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					clues: responses.map(({ wordId, at }) => ({ wordId, at })),
					...(isAnon ? buildAnonNameBody() : {}),
				}),
			}).catch((error: unknown) => {
				// The in-memory set still stops a repeat in this session; at worst
				// another device or a reload shows the clue once more.
				console.warn("[clue-requests] failed to mark clues seen", error);
			});
		},
		[dateKey, isAnon],
	);

	// Merge delivered clues from any path (snapshot on open, live event, or the
	// polling fallback) into state, and notify listeners once per clue so a clue
	// surfaces the same way whether it arrives while playing or on opening the game.
	// Notifying waits until the page is visible: a toast fired into a background
	// tab sits paused until the player returns, by which time another device may
	// have shown it. The poll that runs on becoming visible picks it back up.
	const ingestResponses = useCallback(
		(responses: ClueResponse[]) => {
			if (responses.length === 0) {
				return;
			}
			// Display state merges every clue unconditionally: the seen flags only
			// gate toasts. Replayed clues already shown on some device still need to
			// render under the words.
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
			if (!isPageVisible()) {
				return;
			}
			const fresh = responses.filter(
				(r) =>
					!r.seen &&
					!notifiedClueKeysRef.current.has(clueSeenMember(r.wordId, r.at)),
			);
			if (fresh.length === 0) {
				return;
			}
			for (const response of fresh) {
				notifiedClueKeysRef.current.add(
					clueSeenMember(response.wordId, response.at),
				);
			}
			markCluesSeen(fresh);
			for (const listener of listenersRef.current) {
				for (const response of fresh) {
					listener({ type: "response", response });
				}
			}
		},
		[markCluesSeen],
	);

	const ingestHelpGiven = useCallback((records: ClueHelpGiven[]) => {
		if (records.length === 0) {
			return;
		}
		setHelpGivenRecords((current) => {
			let changed = false;
			const next = [...current];
			for (const record of records) {
				const key = clueHelpGivenField(record.requesterId, record.wordId);
				if (helpGivenKeysRef.current.has(key)) {
					continue;
				}
				helpGivenKeysRef.current.add(key);
				next.push(record);
				changed = true;
			}
			return changed ? next : current;
		});
	}, []);

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
					helpGiven?: ClueHelpGiven[];
					participantId?: string;
				};
				// First message on the stream, so a guest who has never written
				// learns the id the server minted for them right after connecting.
				if (isAnon) {
					rememberAnonParticipantId(snapshot.participantId);
				}
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
				ingestHelpGiven(snapshot.helpGiven ?? []);
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
	}, [active, dateKey, isAnon, localUserId, ingestResponses, ingestHelpGiven]);

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
	// could give). ingestResponses dedupes, so a clue notifies exactly once. Coming
	// back to the tab polls straight away, so clues that arrived while it was hidden
	// notify on return — unless another device has shown them in the meantime.
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
					helpGiven?: ClueHelpGiven[];
					participantId?: string;
				};
				if (cancelled) return;
				if (isAnon) {
					rememberAnonParticipantId(data.participantId);
				}
				if (data.requests) {
					reconcileIncomingRequests(data.requests);
				}
				if (data.responses && data.responses.length > 0) {
					ingestResponses(data.responses);
				}
				if (data.helpGiven && data.helpGiven.length > 0) {
					ingestHelpGiven(data.helpGiven);
				}
			} catch {
				// best-effort; the SSE path or the next poll will recover
			}
		};

		const handleVisibilityChange = () => {
			if (isPageVisible()) {
				void pollInbox();
			}
		};

		const interval = window.setInterval(pollInbox, 8000);
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [
		active,
		dateKey,
		isAnon,
		ingestResponses,
		ingestHelpGiven,
		reconcileIncomingRequests,
	]);

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
		async (wordId: number, hasAiClue = false): Promise<boolean> => {
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
					body: JSON.stringify({
						wordId,
						hasAiClue,
						...(isAnon ? buildAnonNameBody() : {}),
					}),
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
		[isAnon, dateKey],
	);

	const respondToClue = useCallback(
		async (requestId: string, text: string): Promise<RespondResult> => {
			if (!dateKey) return { ok: false, reason: null };
			const request = incomingRequests.find((r) => r.id === requestId);
			try {
				const response = await fetch(`/api/clue-requests/${dateKey}/respond`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						requestId,
						text,
						...(isAnon ? buildAnonNameBody() : {}),
					}),
				});
				if (response.ok) {
					if (request) {
						ingestHelpGiven([
							{
								requesterId: request.requesterId,
								wordId: request.wordId,
								requesterName: request.requesterName,
								at: new Date().toISOString(),
							},
						]);
					}
					return { ok: true };
				}
				let reason: string | null = null;
				try {
					const data = (await response.json()) as { reason?: string };
					reason = data.reason ?? null;
				} catch {
					reason = null;
				}
				if (reason === "already_helped" && request) {
					ingestHelpGiven([
						{
							requesterId: request.requesterId,
							wordId: request.wordId,
							requesterName: request.requesterName,
							at: new Date().toISOString(),
						},
					]);
				}
				return { ok: false, reason };
			} catch {
				return { ok: false, reason: null };
			}
		},
		[isAnon, dateKey, incomingRequests, ingestHelpGiven],
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
					body: JSON.stringify({
						wordId,
						...(isAnon ? buildAnonNameBody() : {}),
					}),
				});
			} catch {
				// best-effort; the request expires on its own otherwise
			}
		},
		[isAnon, dateKey],
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
		const helped = new Set(
			helpGivenRecords.map((record) =>
				clueHelpGivenField(record.requesterId, record.wordId),
			),
		);
		return incomingRequests.filter(
			(r) =>
				solved.has(r.wordId) &&
				!helped.has(clueHelpGivenField(r.requesterId, r.wordId)),
		);
	}, [incomingRequests, helpGivenRecords, solvedWordIds]);

	const value = useMemo<ClueRequestsContextValue>(
		() => ({
			dateKey,
			incomingRequests: visibleRequests,
			receivedClues,
			helpGivenRecords,
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
			helpGivenRecords,
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
