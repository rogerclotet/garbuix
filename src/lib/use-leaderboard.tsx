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
import {
	type LeaderboardEntry,
	type LeaderboardEvent,
	type LeaderboardSnapshot,
	sortLeaderboardEntries,
} from "@/lib/leaderboard-types";

type LeaderboardStatus = "idle" | "connecting" | "open" | "error" | "closed";

type LeaderboardContextValue = {
	dateKey: string | null;
	entries: LeaderboardEntry[];
	status: LeaderboardStatus;
	localParticipantId: string | null;
	subscribe(listener: (event: LeaderboardEvent) => void): () => void;
	refresh(): void;
};

const LeaderboardContext = createContext<LeaderboardContextValue | null>(null);

export type LeaderboardProviderProps = PropsWithChildren<{
	dateKey: string | null;
	localParticipantId: string | null;
	initialSnapshot?: LeaderboardSnapshot | null;
	enabled?: boolean;
}>;

const sortEntries = sortLeaderboardEntries;

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
	// Bumping this token tears down and reopens the EventSource, which re-pulls a
	// fresh snapshot from the server. Used to force a refresh when the user opens
	// the leaderboard, in case the long-lived stream has gone stale.
	const [refreshToken, setRefreshToken] = useState(0);
	const listenersRef = useRef<Set<(event: LeaderboardEvent) => void>>(
		new Set(),
	);

	// refreshToken is intentionally in the dependency list: bumping it reconnects
	// the stream even though it isn't read inside the effect body.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
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
	}, [dateKey, enabled, refreshToken]);

	const subscribe = useCallback(
		(listener: (event: LeaderboardEvent) => void) => {
			listenersRef.current.add(listener);
			return () => {
				listenersRef.current.delete(listener);
			};
		},
		[],
	);

	const refresh = useCallback(() => {
		setRefreshToken((token) => token + 1);
	}, []);

	const value = useMemo<LeaderboardContextValue>(
		() => ({
			dateKey,
			entries,
			status,
			localParticipantId,
			subscribe,
			refresh,
		}),
		[dateKey, entries, status, localParticipantId, subscribe, refresh],
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
			refresh: () => {},
		};
	}
	return ctx;
}
