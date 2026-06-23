import { getTodayDateKey } from "@/lib/puzzle-dates";
import type { HistoryStats, HistorySummaryEntry } from "@/lib/puzzle-types";

type HistoryStreaks = {
	currentStreak: number;
	bestStreak: number;
};

function shiftDateKey(dateKey: string, days: number) {
	const date = new Date(`${dateKey}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function dedupeHistoryEntries(entries: HistorySummaryEntry[]) {
	const entriesByDate = new Map<string, HistorySummaryEntry>();

	for (const entry of entries) {
		const existing = entriesByDate.get(entry.dateKey);
		if (!existing) {
			entriesByDate.set(entry.dateKey, entry);
			continue;
		}

		if (entry.completed && !existing.completed) {
			entriesByDate.set(entry.dateKey, entry);
			continue;
		}

		if (entry.lastUpdated > existing.lastUpdated) {
			entriesByDate.set(entry.dateKey, entry);
		}
	}

	return entriesByDate;
}

export function upsertHistoryEntry(
	entries: HistorySummaryEntry[],
	entry: HistorySummaryEntry,
) {
	const filteredEntries = entries.filter(
		(existingEntry) => existingEntry.dateKey !== entry.dateKey,
	);
	return [entry, ...filteredEntries].sort((left, right) =>
		right.dateKey.localeCompare(left.dateKey),
	);
}

export function calculateHistoryStreaks(
	entries: HistorySummaryEntry[],
	options?: {
		referenceDateKey?: string;
	},
): HistoryStreaks {
	const referenceDateKey = options?.referenceDateKey ?? getTodayDateKey();
	const entriesByDate = dedupeHistoryEntries(entries);
	const completedDates = Array.from(entriesByDate.values())
		.filter((entry) => entry.completed)
		.map((entry) => entry.dateKey)
		.sort((left, right) => left.localeCompare(right));

	let bestStreak = 0;
	let runningBest = 0;

	for (const [index, dateKey] of completedDates.entries()) {
		if (
			runningBest > 0 &&
			shiftDateKey(dateKey, -1) === completedDates[index - 1]
		) {
			runningBest += 1;
		} else {
			runningBest = 1;
		}

		if (runningBest > bestStreak) {
			bestStreak = runningBest;
		}
	}

	const todayEntry = entriesByDate.get(referenceDateKey);
	let streakCursor = referenceDateKey;

	if (todayEntry) {
		if (!todayEntry.completed) {
			return {
				currentStreak: 0,
				bestStreak,
			};
		}
	} else {
		streakCursor = shiftDateKey(referenceDateKey, -1);
		if (!entriesByDate.get(streakCursor)?.completed) {
			return {
				currentStreak: 0,
				bestStreak,
			};
		}
	}

	let currentStreak = 0;
	while (entriesByDate.get(streakCursor)?.completed) {
		currentStreak += 1;
		streakCursor = shiftDateKey(streakCursor, -1);
	}

	return {
		currentStreak,
		bestStreak,
	};
}

// Aggregates the summary stats shown on the history page. Expects entries that
// are already deduplicated by dateKey (totals are counted per entry).
export function calculateHistoryStats(
	entries: HistorySummaryEntry[],
	options?: {
		referenceDateKey?: string;
	},
): HistoryStats {
	const totalDays = entries.length;
	const completedDays = entries.filter((entry) => entry.completed).length;
	const { bestStreak, currentStreak } = calculateHistoryStreaks(
		entries,
		options,
	);
	const completionRate = totalDays
		? Math.round((completedDays / totalDays) * 100)
		: 0;
	const totalGuesses = entries.reduce(
		(total, entry) => total + entry.guessCount,
		0,
	);
	const avgGuesses = totalDays ? totalGuesses / totalDays : 0;

	return {
		totalDays,
		completedDays,
		completionRate,
		currentStreak,
		bestStreak,
		avgGuesses,
	};
}
