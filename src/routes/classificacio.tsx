import { createFileRoute } from "@tanstack/react-router";
import { LeaderboardList } from "@/components/leaderboard/leaderboard-list";
import { getLeaderboardSnapshot } from "@/lib/leaderboard-server-fns";
import { getTodayDateKey } from "@/lib/puzzle-dates";
import { useLeaderboard } from "@/lib/use-leaderboard";

const dateFormatter = new Intl.DateTimeFormat("ca-ES", {
	day: "numeric",
	month: "long",
	year: "numeric",
});

export const Route = createFileRoute("/classificacio")({
	loader: async () => {
		const dateKey = getTodayDateKey();
		const snapshot = await getLeaderboardSnapshot({ data: { dateKey } });
		return { dateKey, snapshot };
	},
	component: LeaderboardPage,
});

function LeaderboardPage() {
	const { dateKey, snapshot } = Route.useLoaderData();
	const live = useLeaderboard();
	const entries =
		live.dateKey === dateKey && live.entries.length > 0
			? live.entries
			: snapshot.entries;

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 sm:py-10">
			<header className="flex items-center justify-between gap-3">
				<p className="text-muted-foreground text-sm">
					Puzzle del {dateFormatter.format(new Date(`${dateKey}T00:00:00`))}
				</p>
				{live.status === "open" ? (
					<span className="text-muted-foreground text-xs">En directe</span>
				) : null}
			</header>
			<LeaderboardList
				entries={entries}
				localParticipantId={live.localParticipantId}
				emptyMessage="Encara no hi ha cap jugador. Sigues el primer!"
			/>
		</div>
	);
}
