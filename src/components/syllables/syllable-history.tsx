import { useEffect, useState } from "react";
import { HistoryView } from "@/components/history/history";
import { calculateHistoryStats } from "@/lib/puzzle-streaks";
import {
	HISTORY_PAGE_SIZE,
	type HistorySummaryEntry,
} from "@/lib/puzzle-types";
import {
	readSyllableSaves,
	syllableHistoryEntries,
	writeSyllableSave,
} from "@/lib/syllable-local";
import { mergeSyllableProgress } from "@/lib/syllable-progress";
import {
	getSyllableHistoryData,
	syncSyllableProgress,
} from "@/lib/syllable-server-fns";

export function SyllableHistory({
	data,
}: {
	data: Awaited<ReturnType<typeof getSyllableHistoryData>>;
}) {
	const [entries, setEntries] = useState<HistorySummaryEntry[]>(data.entries);
	const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
	const [syncFailed, setSyncFailed] = useState(false);
	useEffect(() => {
		let cancelled = false;
		const userId = data.userId;
		const local = syllableHistoryEntries(userId);
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
				const pending = new Map(Object.entries(readSyllableSaves(null)));
				for (const [date, progress] of Object.entries(
					readSyllableSaves(userId),
				))
					pending.set(
						date,
						mergeSyllableProgress(pending.get(date) ?? null, progress),
					);
				for (const [date, progress] of pending) {
					if (cancelled) return;
					const saved = await syncSyllableProgress({ data: progress });
					writeSyllableSave(userId, date, saved);
				}
				const refreshed = await getSyllableHistoryData();
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
				mode="syllables"
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
