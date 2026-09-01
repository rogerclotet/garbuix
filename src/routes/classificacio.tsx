import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { DifficultyBars } from "@/components/difficulty-bars";
import { LeaderboardList } from "@/components/leaderboard/leaderboard-list";
import { TriesHistogram } from "@/components/leaderboard/tries-histogram";
import { getLeaderboardSnapshot } from "@/lib/leaderboard-server-fns";
import { getTodayDateKey } from "@/lib/puzzle-dates";
import { getDailyPuzzleDifficulty } from "@/lib/puzzle-server-fns";
import { useLeaderboard } from "@/lib/use-leaderboard";

const dateFormatter = new Intl.DateTimeFormat("ca-ES", {
	day: "numeric",
	month: "long",
	year: "numeric",
});

export const Route = createFileRoute("/classificacio")({
	loader: async () => {
		const dateKey = getTodayDateKey();
		const [snapshot, difficulty] = await Promise.all([
			getLeaderboardSnapshot({ data: { dateKey } }),
			getDailyPuzzleDifficulty({ data: { dateKey } }),
		]);
		return { dateKey, snapshot, difficulty };
	},
	// Always fetch a fresh snapshot when the page is opened: drop any cached
	// match data on unmount and skip intent-preload caching so navigation can't
	// show a stale leaderboard.
	gcTime: 0,
	preload: false,
	// Show the loading state immediately while the fresh snapshot loads.
	pendingMs: 0,
	pendingComponent: LeaderboardPending,
	component: LeaderboardPage,
});

function LeaderboardPending() {
	return (
		<div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-16 text-muted-foreground">
			<Loader2 className="size-6 animate-spin" />
			<p className="text-sm">Carregant la classificació…</p>
		</div>
	);
}

function LeaderboardPage() {
	const { dateKey, snapshot, difficulty } = Route.useLoaderData();
	const live = useLeaderboard();

	// Force the (long-lived, root-level) stream to reconnect when the page opens
	// so a stale connection can't keep showing old values until a manual refresh.
	const { refresh } = live;
	useEffect(() => {
		refresh();
	}, [refresh]);

	const entries =
		live.dateKey === dateKey && live.entries.length > 0
			? live.entries
			: snapshot.entries;

	// Only mark the reader's own bucket once they've finished today's puzzle.
	const localEntry = entries.find(
		(entry) => entry.participantId === live.localParticipantId,
	);
	const localTries =
		localEntry?.completedAt != null ? localEntry.tryCount : null;

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 sm:py-10">
			<header className="flex items-center justify-between gap-3">
				<p className="text-muted-foreground text-sm">
					{dateFormatter.format(new Date(`${dateKey}T00:00:00`))}
				</p>
				<DifficultyBars difficulty={difficulty} label="phrase" />
			</header>
			<TriesHistogram entries={entries} highlightTries={localTries} />
			<LeaderboardList
				entries={entries}
				localParticipantId={live.localParticipantId}
				emptyMessage="Encara no hi ha cap jugador. Sigues el primer!"
			/>
		</div>
	);
}
