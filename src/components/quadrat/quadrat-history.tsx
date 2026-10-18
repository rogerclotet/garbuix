import { useEffect, useState } from "react";
import { HistoryView } from "@/components/history/history";
import { calculateHistoryStats } from "@/lib/puzzle-streaks";
import {
	HISTORY_PAGE_SIZE,
	type HistorySummaryEntry,
} from "@/lib/puzzle-types";
import {
	quadratHistoryEntries,
	readQuadratSaves,
	writeQuadratSave,
} from "@/lib/quadrat-local";
import { mergeQuadratProgress } from "@/lib/quadrat-progress";
import {
	getQuadratHistoryData,
	syncQuadratProgress,
} from "@/lib/quadrat-server-fns";
import { QuadratSolution } from "./quadrat-solution";

type QuadratHistoryData = Awaited<ReturnType<typeof getQuadratHistoryData>>;

export function QuadratHistory({ data }: { data: QuadratHistoryData }) {
	const [entries, setEntries] = useState<HistorySummaryEntry[]>(data.entries);
	const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
	const [syncFailed, setSyncFailed] = useState(false);
	useEffect(() => {
		let cancelled = false;
		const userId = data.userId;
		// Pending local play is visible even when navigation beats the next sync.
		const combined = new Map<string, HistorySummaryEntry>(
			data.entries.map((entry) => [entry.dateKey, entry]),
		);
		for (const entry of quadratHistoryEntries(userId)) {
			const existing = combined.get(entry.dateKey);
			if (!existing || entry.guessedWords >= existing.guessedWords)
				combined.set(entry.dateKey, entry);
		}
		setEntries(
			[...combined.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey)),
		);
		if (!userId) return;

		async function sync(signedInUserId: string) {
			const pending = new Map(Object.entries(readQuadratSaves(null)));
			for (const [date, progress] of Object.entries(
				readQuadratSaves(signedInUserId),
			))
				pending.set(
					date,
					mergeQuadratProgress(pending.get(date) ?? null, progress),
				);
			for (const [date, progress] of pending) {
				if (cancelled) return;
				const saved = await syncQuadratProgress({ data: progress });
				writeQuadratSave(signedInUserId, date, saved);
			}
			const refreshed = await getQuadratHistoryData();
			if (!cancelled) setEntries(refreshed.entries);
		}
		sync(userId).catch((error: unknown) => {
			if (cancelled) return;
			console.warn("[quadrat] History sync failed", error);
			setSyncFailed(true);
		});
		return () => {
			cancelled = true;
		};
	}, [data]);

	return (
		<>
			{syncFailed ? (
				<p role="status" className="px-4 pt-4 text-sm text-muted-foreground">
					Es mostren els resultats desats. No s'ha pogut sincronitzar el compte.
				</p>
			) : null}
			<HistoryView
				mode="quadrat"
				entries={entries.slice(0, visibleCount)}
				stats={calculateHistoryStats(entries)}
				yesterdayPuzzle={
					data.yesterday
						? {
								dateKey: data.yesterday.dateKey,
								solution: (
									<QuadratSolution
										letters={data.yesterday.letters}
										words={data.yesterday.words}
									/>
								),
							}
						: null
				}
				hasMore={visibleCount < entries.length}
				isLoadingMore={false}
				onLoadMore={() => setVisibleCount((count) => count + HISTORY_PAGE_SIZE)}
			/>
		</>
	);
}
