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
} from "@/lib/clue-request-types";

type ClueRequestsStatus = "idle" | "connecting" | "open" | "error" | "closed";

export type RespondResult = { ok: true } | { ok: false; reason: string | null };

type ClueRequestsContextValue = {
	dateKey: string | null;
	incomingRequests: ClueRequest[];
	status: ClueRequestsStatus;
	enabled: boolean;
	subscribe(listener: (event: ClueRequestStreamEvent) => void): () => void;
	requestClue(wordId: number): Promise<boolean>;
	respondToClue(requestId: string, text: string): Promise<RespondResult>;
};

const noop = () => {};

const defaultValue: ClueRequestsContextValue = {
	dateKey: null,
	incomingRequests: [],
	status: "idle",
	enabled: false,
	subscribe: () => noop,
	requestClue: async () => false,
	respondToClue: async () => ({ ok: false, reason: null }),
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
				const snapshot = JSON.parse(event.data) as { requests: ClueRequest[] };
				setIncomingRequests(snapshot.requests ?? []);
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

	const value = useMemo<ClueRequestsContextValue>(
		() => ({
			dateKey,
			incomingRequests,
			status,
			enabled: active,
			subscribe,
			requestClue,
			respondToClue,
		}),
		[
			dateKey,
			incomingRequests,
			status,
			active,
			subscribe,
			requestClue,
			respondToClue,
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
