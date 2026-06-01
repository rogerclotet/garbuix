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
	status: ClueRequestsStatus;
	enabled: boolean;
	subscribe(listener: (event: ClueRequestStreamEvent) => void): () => void;
	requestClue(wordId: number): Promise<boolean>;
	respondToClue(requestId: string, text: string): Promise<RespondResult>;
	resolveClue(wordId: number): Promise<void>;
};

const noop = () => {};

const defaultValue: ClueRequestsContextValue = {
	dateKey: null,
	incomingRequests: [],
	receivedClues: {},
	status: "idle",
	enabled: false,
	subscribe: () => noop,
	requestClue: async () => false,
	respondToClue: async () => ({ ok: false, reason: null }),
	resolveClue: async () => {},
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
	// Requests this user has already answered, hidden from the badge/list so the
	// count reflects only outstanding requests they could still help with.
	const [respondedRequestIds, setRespondedRequestIds] = useState<string[]>([]);
	const [status, setStatus] = useState<ClueRequestsStatus>("idle");
	const listenersRef = useRef<Set<(event: ClueRequestStreamEvent) => void>>(
		new Set(),
	);

	const active = enabled && dateKey != null && localUserId != null;

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
					responses?: ClueResponse[];
				};
				setIncomingRequests(snapshot.requests ?? []);
				// Merge replayed clues so a previously-missed live event recovers,
				// without re-toasting (snapshot responses don't reach subscribers).
				if (snapshot.responses && snapshot.responses.length > 0) {
					setReceivedClues((current) => {
						const next = { ...current };
						for (const response of snapshot.responses ?? []) {
							next[response.wordId] = response;
						}
						return next;
					});
				}
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
					setReceivedClues((current) => ({
						...current,
						[payload.response.wordId]: payload.response,
					}));
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
	}, [active, dateKey, localUserId]);

	// Polling fallback for delivered clues: the live SSE event can be dropped (a
	// proxy buffering the open stream in production), so the asker would otherwise
	// wait forever. The inbox is tiny; merge it in every few seconds. No toast on
	// this path — only live events toast.
	useEffect(() => {
		if (!active || !dateKey || typeof window === "undefined") {
			return;
		}

		let cancelled = false;

		const pollInbox = async () => {
			try {
				const response = await fetch(`/api/clue-requests/${dateKey}/inbox`);
				if (!response.ok) return;
				const data = (await response.json()) as { responses?: ClueResponse[] };
				if (cancelled || !data.responses || data.responses.length === 0) {
					return;
				}
				setReceivedClues((current) => {
					const next = { ...current };
					for (const clue of data.responses ?? []) {
						next[clue.wordId] = clue;
					}
					return next;
				});
			} catch {
				// best-effort; the SSE path or the next poll will recover
			}
		};

		const interval = window.setInterval(pollInbox, 8000);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [active, dateKey]);

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
			try {
				const response = await fetch(`/api/clue-requests/${dateKey}/request`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ wordId }),
				});
				if (!response.ok) return false;
				const data = (await response.json()) as { created?: boolean };
				return Boolean(data.created);
			} catch {
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

	const visibleRequests = useMemo(
		() => incomingRequests.filter((r) => !respondedRequestIds.includes(r.id)),
		[incomingRequests, respondedRequestIds],
	);

	const value = useMemo<ClueRequestsContextValue>(
		() => ({
			dateKey,
			incomingRequests: visibleRequests,
			receivedClues,
			status,
			enabled: active,
			subscribe,
			requestClue,
			respondToClue,
			resolveClue,
		}),
		[
			dateKey,
			visibleRequests,
			receivedClues,
			status,
			active,
			subscribe,
			requestClue,
			respondToClue,
			resolveClue,
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
