import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { LeaderboardList } from "@/components/leaderboard/leaderboard-list";
import { Button } from "@/components/ui/button";
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
			<div className="flex items-center justify-between">
				<Button variant="ghost" size="sm" asChild>
					<Link to="/">
						<ArrowLeft className="size-4" />
						<span>Tornar</span>
					</Link>
				</Button>
				<span className="text-muted-foreground text-xs">
					{live.status === "open" ? "En directe" : null}
				</span>
			</div>
			<header className="flex flex-col gap-1">
				<h1 className="font-bold text-2xl text-primary">Classificació</h1>
				<p className="text-muted-foreground text-sm">
					Puzzle del {dateFormatter.format(new Date(`${dateKey}T00:00:00`))}
				</p>
			</header>
			<LeaderboardList
				entries={entries}
				localParticipantId={live.localParticipantId}
				emptyMessage="Encara no hi ha cap jugador. Sigues el primer!"
			/>
		</div>
	);
}
