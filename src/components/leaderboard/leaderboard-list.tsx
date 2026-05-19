import { LeaderboardRow } from "@/components/leaderboard/leaderboard-row";
import type { LeaderboardEntry } from "@/lib/leaderboard-types";

type LeaderboardListProps = {
	entries: LeaderboardEntry[];
	localParticipantId?: string | null;
	emptyMessage?: string;
};

export function LeaderboardList({
	entries,
	localParticipantId,
	emptyMessage = "Encara no hi ha jugadors al rànquing.",
}: LeaderboardListProps) {
	if (entries.length === 0) {
		return (
			<p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-muted-foreground text-sm">
				{emptyMessage}
			</p>
		);
	}
	return (
		<ol className="flex flex-col gap-1">
			{entries.map((entry, index) => (
				<LeaderboardRow
					key={entry.participantId}
					rank={index + 1}
					entry={entry}
					highlighted={entry.participantId === localParticipantId}
				/>
			))}
		</ol>
	);
}
