import { desc, eq } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import {
	dailyPuzzles,
	legacyImportedResults,
	userPuzzleProgress,
} from "@/db/schema";
import { db } from "@/lib/db";
import {
	getLeaderboard,
	mergeAnonLeaderboardForUser,
} from "@/lib/leaderboard.server";
import { captureServerEvent } from "@/lib/observability-server";
import { getTodayDateKey, getYesterdayDateKey } from "@/lib/puzzle-dates";
import { toPuzzleDifficulty } from "@/lib/puzzle-difficulty";
import { readDailyPuzzleRow } from "@/lib/puzzle-generation.server";
import { publishLeaderboardForUser } from "@/lib/puzzle-leaderboard.server";
import {
	getCompatibleProgress,
	mergeProgressStates,
} from "@/lib/puzzle-progress";
import {
	getUserPuzzleProgressData,
	saveUserPuzzleProgress,
} from "@/lib/puzzle-progress-store.server";
import { toPuzzlePreview } from "@/lib/puzzle-snapshot";
import { calculateHistoryStats } from "@/lib/puzzle-streaks";
import {
	type AnonymousImportPayload,
	HISTORY_PAGE_SIZE,
	type HistoryEntriesPage,
	type HistoryStats,
	type HistorySummaryEntry,
} from "@/lib/puzzle-types";
import { resolveAvatarImage, resolveDisplayName } from "@/lib/user-profile";

// Deduplicates by dateKey, preferring full progress over legacy summaries and
// the most recently updated entry among the same source, sorted newest first.
function dedupeHistoryEntriesByDate(
	entries: HistorySummaryEntry[],
): HistorySummaryEntry[] {
	const deduped = new Map<string, HistorySummaryEntry>();
	for (const entry of entries) {
		const existing = deduped.get(entry.dateKey);
		if (!existing) {
			deduped.set(entry.dateKey, entry);
			continue;
		}
		// Prefer non-legacy (full progress) over legacy (summary-only)
		if (!entry.legacy && existing.legacy) {
			deduped.set(entry.dateKey, entry);
			continue;
		}
		// Among same type, prefer more recently updated
		if (entry.lastUpdated > existing.lastUpdated) {
			deduped.set(entry.dateKey, entry);
		}
	}

	return Array.from(deduped.values()).sort((left, right) =>
		right.dateKey.localeCompare(left.dateKey),
	);
}

export async function getHistoryEntriesForUser(userId: string) {
	const progressRows = await db.query.userPuzzleProgress.findMany({
		where: eq(userPuzzleProgress.userId, userId),
		with: {
			puzzle: true,
		},
		orderBy: [desc(userPuzzleProgress.lastSyncedAt)],
	});
	const legacyRows = await db.query.legacyImportedResults.findMany({
		where: eq(legacyImportedResults.userId, userId),
		orderBy: [desc(legacyImportedResults.dateKey)],
	});

	const entries: HistorySummaryEntry[] = progressRows.map((row) => ({
		dateKey: row.puzzle.dateKey,
		seed: row.puzzle.seed,
		totalWords: row.puzzle.wordCount,
		guessedWords: row.guessedWordIds.length,
		guessCount: row.guessCount,
		hintsUsed: row.hintsUsed,
		completed: row.completedAt != null,
		lastUpdated: row.lastSyncedAt.toISOString(),
		difficulty: toPuzzleDifficulty(row.puzzle.difficulty),
	}));

	for (const row of legacyRows) {
		entries.push({
			dateKey: row.dateKey,
			seed: row.seed,
			totalWords: row.totalWords,
			guessedWords: row.guessedWords,
			guessCount: row.guessCount,
			hintsUsed: row.hintsUsed,
			completed: row.completed,
			lastUpdated: row.lastUpdated.toISOString(),
			legacy: true,
		});
	}

	return dedupeHistoryEntriesByDate(entries);
}

// Fetches a single page of detailed history entries ordered newest first. Only
// over-fetches `offset + limit + 1` rows per source table so the initial load
// stays cheap regardless of how many days the account has accumulated. The
// extra row lets us report `hasMore` without a separate count query, and
// over-fetching from both tables keeps the page correct after deduplication
// (the true top-K of the union is always within each table's top-K).
export async function getHistoryEntriesPageForUser(
	userId: string,
	{ offset, limit }: { offset: number; limit: number },
): Promise<HistoryEntriesPage> {
	const fetchCount = offset + limit + 1;

	const progressRows = await db
		.select({
			dateKey: dailyPuzzles.dateKey,
			seed: dailyPuzzles.seed,
			wordCount: dailyPuzzles.wordCount,
			difficulty: dailyPuzzles.difficulty,
			guessedWordIds: userPuzzleProgress.guessedWordIds,
			guessCount: userPuzzleProgress.guessCount,
			hintsUsed: userPuzzleProgress.hintsUsed,
			completedAt: userPuzzleProgress.completedAt,
			lastSyncedAt: userPuzzleProgress.lastSyncedAt,
		})
		.from(userPuzzleProgress)
		.innerJoin(dailyPuzzles, eq(userPuzzleProgress.puzzleId, dailyPuzzles.id))
		.where(eq(userPuzzleProgress.userId, userId))
		.orderBy(desc(dailyPuzzles.dateKey))
		.limit(fetchCount);

	const legacyRows = await db
		.select()
		.from(legacyImportedResults)
		.where(eq(legacyImportedResults.userId, userId))
		.orderBy(desc(legacyImportedResults.dateKey))
		.limit(fetchCount);

	const entries: HistorySummaryEntry[] = progressRows.map((row) => ({
		dateKey: row.dateKey,
		seed: row.seed,
		totalWords: row.wordCount,
		guessedWords: row.guessedWordIds.length,
		guessCount: row.guessCount,
		hintsUsed: row.hintsUsed,
		completed: row.completedAt != null,
		lastUpdated: row.lastSyncedAt.toISOString(),
		difficulty: toPuzzleDifficulty(row.difficulty),
	}));

	for (const row of legacyRows) {
		entries.push({
			dateKey: row.dateKey,
			seed: row.seed,
			totalWords: row.totalWords,
			guessedWords: row.guessedWords,
			guessCount: row.guessCount,
			hintsUsed: row.hintsUsed,
			completed: row.completed,
			lastUpdated: row.lastUpdated.toISOString(),
			legacy: true,
		});
	}

	const deduped = dedupeHistoryEntriesByDate(entries);

	return {
		entries: deduped.slice(offset, offset + limit),
		hasMore: deduped.length > offset + limit,
	};
}

// Computes the aggregate stats independently from the paginated entry list so
// streaks/totals stay accurate without loading every day's heavy columns. Reads
// only the lightweight columns the stats need.
export async function getHistoryStatsForUser(
	userId: string,
): Promise<HistoryStats> {
	const cluesGivenRows = await db
		.select({ cluesGivenCount: user.cluesGivenCount })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	const cluesGiven = cluesGivenRows[0]?.cluesGivenCount ?? 0;

	const progressRows = await db
		.select({
			dateKey: dailyPuzzles.dateKey,
			completedAt: userPuzzleProgress.completedAt,
			guessCount: userPuzzleProgress.guessCount,
			lastSyncedAt: userPuzzleProgress.lastSyncedAt,
		})
		.from(userPuzzleProgress)
		.innerJoin(dailyPuzzles, eq(userPuzzleProgress.puzzleId, dailyPuzzles.id))
		.where(eq(userPuzzleProgress.userId, userId));

	const legacyRows = await db
		.select({
			dateKey: legacyImportedResults.dateKey,
			completed: legacyImportedResults.completed,
			guessCount: legacyImportedResults.guessCount,
			lastUpdated: legacyImportedResults.lastUpdated,
		})
		.from(legacyImportedResults)
		.where(eq(legacyImportedResults.userId, userId));

	const entries: HistorySummaryEntry[] = progressRows.map((row) => ({
		dateKey: row.dateKey,
		seed: null,
		totalWords: 0,
		guessedWords: 0,
		guessCount: row.guessCount,
		hintsUsed: 0,
		completed: row.completedAt != null,
		lastUpdated: row.lastSyncedAt.toISOString(),
	}));

	for (const row of legacyRows) {
		entries.push({
			dateKey: row.dateKey,
			seed: null,
			totalWords: 0,
			guessedWords: 0,
			guessCount: row.guessCount,
			hintsUsed: 0,
			completed: row.completed,
			lastUpdated: row.lastUpdated.toISOString(),
			legacy: true,
		});
	}

	return {
		...calculateHistoryStats(dedupeHistoryEntriesByDate(entries)),
		cluesGiven,
	};
}

export type AccountHistoryPage = HistoryEntriesPage & {
	stats: HistoryStats;
};

export async function getHistoryPageDataForUser(
	userId?: string,
	dateKey = getYesterdayDateKey(),
) {
	// Read-only: the date reaches here from a request, and a day nobody played
	// has no stored puzzle. Generating one on the spot would let any caller fill
	// the table with puzzles for arbitrary past dates, so the panel is simply
	// omitted instead (see yesterdayPuzzle below).
	const yesterdayPuzzleRow = await readDailyPuzzleRow(dateKey);
	const accountHistory: AccountHistoryPage | null = userId
		? {
				...(await getHistoryEntriesPageForUser(userId, {
					offset: 0,
					limit: HISTORY_PAGE_SIZE,
				})),
				stats: await getHistoryStatsForUser(userId),
			}
		: null;
	const yesterdayLeaderboard = await getLeaderboard(dateKey);

	captureServerEvent({
		distinctId: userId,
		event: "history_page_loaded_server",
		properties: {
			date_key: dateKey,
			has_account_history: Boolean(accountHistory),
			history_entry_count: accountHistory?.stats.totalDays ?? 0,
			yesterday_leaderboard_entry_count: yesterdayLeaderboard.entries.length,
		},
	});

	return {
		accountHistory,
		yesterdayPuzzle: yesterdayPuzzleRow
			? {
					dateKey: yesterdayPuzzleRow.dateKey,
					preview: toPuzzlePreview(yesterdayPuzzleRow.privateSnapshotJson),
					difficulty: toPuzzleDifficulty(
						yesterdayPuzzleRow.difficulty ??
							yesterdayPuzzleRow.publicSnapshotJson.difficulty,
					),
				}
			: null,
		yesterdayLeaderboard,
	};
}

export async function importAnonymousProgressForUser(options: {
	userId: string;
	// The guest's server-issued leaderboard identity, read from the signed
	// cookie. Null when this browser never played as a guest, in which case
	// there is no anonymous board entry to merge in.
	anonDeviceId: string | null;
	payload: AnonymousImportPayload;
}) {
	const { anonDeviceId, payload, userId } = options;
	const importedDates: string[] = [];
	const skippedLegacyDates: string[] = [];
	const importedForLeaderboard: Array<{
		dateKey: string;
		wordsFound: number;
		totalWords: number;
		freeCluesUsed: number;
		tryCount: number;
		completedAt: string | null;
	}> = [];

	for (const historyEntry of payload.historyEntries) {
		const activeProgress = payload.activeProgressByDate[historyEntry.dateKey];
		if (!activeProgress) {
			await saveLegacyHistoryEntry(userId, historyEntry);
			skippedLegacyDates.push(historyEntry.dateKey);
			continue;
		}

		// Read-only: these date keys come straight from the client's localStorage
		// payload, so generating here would let any signed-in account create
		// puzzles for arbitrary dates. A day with no stored puzzle is imported as
		// a legacy result, the same fallback used when the progress doesn't match.
		const puzzle = await readDailyPuzzleRow(historyEntry.dateKey);
		if (
			!puzzle ||
			!getCompatibleProgress(activeProgress, puzzle.publicSnapshotJson)
		) {
			await saveLegacyHistoryEntry(userId, historyEntry);
			skippedLegacyDates.push(historyEntry.dateKey);
			continue;
		}

		const existingProgress = await getUserPuzzleProgressData(puzzle.id, userId);
		const merged = mergeProgressStates(existingProgress, activeProgress);

		await saveUserPuzzleProgress(userId, merged);

		importedDates.push(historyEntry.dateKey);
		importedForLeaderboard.push({
			dateKey: historyEntry.dateKey,
			wordsFound: merged.guessedWordIds.length,
			totalWords: puzzle.privateSnapshotJson.wordSlots.length,
			freeCluesUsed: merged.hintsUsed,
			tryCount: merged.guessCount,
			completedAt: merged.completedAt,
		});
	}

	const dateKeysForLeaderboardMerge = [
		getTodayDateKey(),
		...importedDates,
		...skippedLegacyDates,
		...Object.keys(payload.activeProgressByDate),
		...payload.historyEntries.map((entry) => entry.dateKey),
	];

	try {
		const profiles = await db
			.select({
				name: user.name,
				displayName: user.displayName,
				image: user.image,
				useGoogleAvatar: user.useGoogleAvatar,
			})
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);
		const profile = profiles[0];
		if (profile && anonDeviceId) {
			await mergeAnonLeaderboardForUser({
				deviceId: anonDeviceId,
				userId,
				name: resolveDisplayName(profile),
				image: resolveAvatarImage(profile),
				dateKeys: dateKeysForLeaderboardMerge,
			});
		}
	} catch (error) {
		console.warn("[leaderboard] merge anon on import failed", error);
	}

	for (const imported of importedForLeaderboard) {
		if (imported.wordsFound === 0 && !imported.completedAt) {
			continue;
		}
		try {
			await publishLeaderboardForUser({
				dateKey: imported.dateKey,
				userId,
				wordsFound: imported.wordsFound,
				totalWords: imported.totalWords,
				freeCluesUsed: imported.freeCluesUsed,
				tryCount: imported.tryCount,
				completedAt: imported.completedAt,
				previousWordsFound: 0,
				previousCompletedAt: null,
			});
		} catch (error) {
			console.warn("[leaderboard] publish on import failed", error);
		}
	}

	captureServerEvent({
		distinctId: userId,
		event: "anonymous_progress_imported_server",
		properties: {
			active_progress_count: Object.keys(payload.activeProgressByDate).length,
			imported_dates: importedDates.length,
			legacy_dates: skippedLegacyDates.length,
			merged_leaderboard_dates: dateKeysForLeaderboardMerge.length,
		},
	});

	return {
		importedDates,
		skippedLegacyDates,
	};
}

async function saveLegacyHistoryEntry(
	userId: string,
	entry: HistorySummaryEntry,
) {
	const fields = {
		seed: entry.seed,
		totalWords: entry.totalWords,
		guessedWords: entry.guessedWords,
		guessCount: entry.guessCount,
		hintsUsed: entry.hintsUsed,
		completed: entry.completed,
		lastUpdated: new Date(entry.lastUpdated),
	};
	await db
		.insert(legacyImportedResults)
		.values({
			id: crypto.randomUUID(),
			userId,
			dateKey: entry.dateKey,
			...fields,
		})
		.onConflictDoUpdate({
			target: [legacyImportedResults.userId, legacyImportedResults.dateKey],
			set: fields,
		});
}
