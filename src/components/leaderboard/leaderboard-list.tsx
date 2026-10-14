import { useState } from "react";
import { LeaderboardRow } from "@/components/leaderboard/leaderboard-row";
import { Button } from "@/components/ui/button";
import type { LeaderboardEntry } from "@/lib/leaderboard-types";

type LeaderboardListProps = {
	entries: LeaderboardEntry[];
	localParticipantId?: string | null;
	emptyMessage?: string;
	// Rows shown until the reader asks for the rest. Omit to show every row.
	collapsedCount?: number;
};

type RankedEntry = {
	rank: number;
	entry: LeaderboardEntry;
};

// Keeps the reader on the collapsed board: when they rank below the cut, their
// row takes the last slot so they still see where they placed.
function pickCollapsedRows(
	ranked: RankedEntry[],
	collapsedCount: number,
	localParticipantId: string | null,
): RankedEntry[] {
	const top = ranked.slice(0, collapsedCount);
	const local = ranked.find(
		({ entry }) => entry.participantId === localParticipantId,
	);
	if (!local || local.rank <= collapsedCount) {
		return top;
	}
	return [...top.slice(0, collapsedCount - 1), local];
}

export function LeaderboardList({
	entries,
	localParticipantId = null,
	emptyMessage = "Encara no hi ha jugadors al rànquing.",
	collapsedCount,
}: LeaderboardListProps) {
	const [expanded, setExpanded] = useState(false);

	if (entries.length === 0) {
		return (
			<p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-muted-foreground text-sm">
				{emptyMessage}
			</p>
		);
	}

	const ranked = entries.map((entry, index) => ({ rank: index + 1, entry }));
	const collapsible = collapsedCount != null && entries.length > collapsedCount;
	const rows =
		collapsible && !expanded
			? pickCollapsedRows(ranked, collapsedCount, localParticipantId)
			: ranked;

	return (
		<div className="flex flex-col gap-3">
			<ol className="flex flex-col gap-1">
				{rows.map(({ rank, entry }) => (
					<LeaderboardRow
						key={entry.participantId}
						rank={rank}
						entry={entry}
						highlighted={entry.participantId === localParticipantId}
					/>
				))}
			</ol>
			{collapsible && !expanded ? (
				<div className="flex justify-center">
					<Button
						variant="ghost"
						className="rounded-none text-muted-foreground"
						onClick={() => setExpanded(true)}
					>
						Mostra'n més
					</Button>
				</div>
			) : null}
		</div>
	);
}
