import { useEffect, useState } from "react";
import { HistoryView } from "@/components/history/history";
import {
	miniHistoryEntries,
	readMiniSaves,
	writeMiniSave,
} from "@/lib/mini-local";
import { mergeMiniProgress } from "@/lib/mini-progress";
import { getMiniHistoryData, syncMiniProgress } from "@/lib/mini-server-fns";
import { calculateHistoryStats } from "@/lib/puzzle-streaks";
import {
	HISTORY_PAGE_SIZE,
	type HistorySummaryEntry,
} from "@/lib/puzzle-types";

export function MiniHistory({
	data,
}: {
	data: Awaited<ReturnType<typeof getMiniHistoryData>>;
}) {
	const [entries, setEntries] = useState<HistorySummaryEntry[]>(data.entries);
	const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
	const [syncFailed, setSyncFailed] = useState(false);
	useEffect(() => {
		let cancelled = false;
		const userId = data.userId;
		const local = miniHistoryEntries(userId);
		// Pending local play is visible even when navigation beats the next sync.
		const combined = new Map<string, HistorySummaryEntry>(
			data.entries.map((entry) => [entry.dateKey, entry]),
		);
		for (const entry of local) {
			const existing = combined.get(entry.dateKey);
			if (!existing || entry.guessedWords >= existing.guessedWords)
				combined.set(entry.dateKey, entry);
		}
		setEntries(
			[...combined.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey)),
		);
		if (userId) {
			async function sync() {
				const pending = new Map(Object.entries(readMiniSaves(null)));
				for (const [date, progress] of Object.entries(readMiniSaves(userId)))
					pending.set(
						date,
						mergeMiniProgress(pending.get(date) ?? null, progress),
					);
				for (const [date, progress] of pending) {
					if (cancelled) return;
					const saved = await syncMiniProgress({ data: progress });
					writeMiniSave(userId, date, saved);
				}
				const refreshed = await getMiniHistoryData();
				if (!cancelled) setEntries(refreshed.entries);
			}
			void sync().catch(() => {
				if (!cancelled) setSyncFailed(true);
			});
		}
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
				mini
				entries={entries.slice(0, visibleCount)}
				stats={calculateHistoryStats(entries)}
				yesterdayPuzzle={data.yesterdayPuzzle}
				hasMore={visibleCount < entries.length}
				isLoadingMore={false}
				onLoadMore={() => setVisibleCount((count) => count + HISTORY_PAGE_SIZE)}
			/>
		</>
	);
}
