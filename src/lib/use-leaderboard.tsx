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
	LeaderboardEntry,
	LeaderboardEvent,
	LeaderboardSnapshot,
} from "@/lib/leaderboard-types";

type LeaderboardStatus = "idle" | "connecting" | "open" | "error" | "closed";

type LeaderboardContextValue = {
	dateKey: string | null;
	entries: LeaderboardEntry[];
	status: LeaderboardStatus;
	localParticipantId: string | null;
	subscribe(listener: (event: LeaderboardEvent) => void): () => void;
};

const LeaderboardContext = createContext<LeaderboardContextValue | null>(null);

export type LeaderboardProviderProps = PropsWithChildren<{
	dateKey: string | null;
	localParticipantId: string | null;
	initialSnapshot?: LeaderboardSnapshot | null;
	enabled?: boolean;
}>;

function sortEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
	return [...entries].sort((a, b) => {
		if (b.wordsFound !== a.wordsFound) {
			return b.wordsFound - a.wordsFound;
		}
		const aCompleted = a.completedAt ? new Date(a.completedAt).getTime() : null;
		const bCompleted = b.completedAt ? new Date(b.completedAt).getTime() : null;
		if (aCompleted && bCompleted) return aCompleted - bCompleted;
		if (aCompleted) return -1;
		if (bCompleted) return 1;
		return a.updatedAt.localeCompare(b.updatedAt);
	});
}

function applyEntry(
	entries: LeaderboardEntry[],
	incoming: LeaderboardEntry,
): LeaderboardEntry[] {
	const filtered = entries.filter(
		(entry) => entry.participantId !== incoming.participantId,
	);
	filtered.push(incoming);
	return sortEntries(filtered);
}

export function LeaderboardProvider({
	dateKey,
	localParticipantId,
	initialSnapshot,
	enabled = true,
	children,
}: LeaderboardProviderProps) {
	const [entries, setEntries] = useState<LeaderboardEntry[]>(
		initialSnapshot ? sortEntries(initialSnapshot.entries) : [],
	);
	const [status, setStatus] = useState<LeaderboardStatus>("idle");
	const listenersRef = useRef<Set<(event: LeaderboardEvent) => void>>(
		new Set(),
	);

	useEffect(() => {
		if (!enabled || !dateKey || typeof window === "undefined") {
			return;
		}

		setStatus("connecting");
		const source = new EventSource(`/api/leaderboard/${dateKey}/stream`);

		const handleSnapshot = (event: MessageEvent) => {
			try {
				const snapshot = JSON.parse(event.data) as LeaderboardSnapshot;
				setEntries(sortEntries(snapshot.entries ?? []));
				setStatus("open");
			} catch {
				// ignore
			}
		};

		const handleUpdate = (event: MessageEvent) => {
			try {
				const payload = JSON.parse(event.data) as LeaderboardEvent;
				setEntries((current) => applyEntry(current, payload.entry));
				for (const listener of listenersRef.current) {
					listener(payload);
				}
			} catch {
				// ignore
			}
		};

		source.addEventListener("snapshot", handleSnapshot);
		source.addEventListener("update", handleUpdate);
		source.onerror = () => setStatus("error");
		source.onopen = () => setStatus("open");

		return () => {
			source.removeEventListener("snapshot", handleSnapshot);
			source.removeEventListener("update", handleUpdate);
			source.close();
			setStatus("closed");
		};
	}, [dateKey, enabled]);

	const subscribe = useCallback(
		(listener: (event: LeaderboardEvent) => void) => {
			listenersRef.current.add(listener);
			return () => {
				listenersRef.current.delete(listener);
			};
		},
		[],
	);

	const value = useMemo<LeaderboardContextValue>(
		() => ({
			dateKey,
			entries,
			status,
			localParticipantId,
			subscribe,
		}),
		[dateKey, entries, status, localParticipantId, subscribe],
	);

	return (
		<LeaderboardContext.Provider value={value}>
			{children}
		</LeaderboardContext.Provider>
	);
}

export function useLeaderboard(): LeaderboardContextValue {
	const ctx = useContext(LeaderboardContext);
	if (!ctx) {
		return {
			dateKey: null,
			entries: [],
			status: "idle",
			localParticipantId: null,
			subscribe: () => () => {},
		};
	}
	return ctx;
}
