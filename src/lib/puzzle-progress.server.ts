import { and, eq, inArray } from "drizzle-orm";
import { dailyPuzzles, puzzleWordClues, userPuzzleEvents } from "@/db/schema";
import { db } from "@/lib/db";
import { captureServerEvent } from "@/lib/observability-server";
import { publishLeaderboardForUser } from "@/lib/puzzle-leaderboard.server";
import {
	buildSyncedProgressState,
	createEmptyProgressState,
} from "@/lib/puzzle-progress";
import {
	getUserPuzzleProgressData,
	saveUserPuzzleProgress,
} from "@/lib/puzzle-progress-store.server";
import {
	collectAckedEventIds,
	filterSyncablePuzzleEvents,
	hasLeaderboardScoreDelta,
} from "@/lib/puzzle-sync";
import type { PuzzleClientEvent } from "@/lib/puzzle-types";

function getStoredEventAt(row: typeof userPuzzleEvents.$inferSelect): string {
	const eventAt =
		typeof row.payload === "object" &&
		row.payload !== null &&
		"_eventAt" in row.payload &&
		typeof row.payload._eventAt === "string"
			? row.payload._eventAt
			: null;

	return eventAt ?? row.createdAt.toISOString();
}

function toPuzzleClientEvent(
	row: typeof userPuzzleEvents.$inferSelect,
): PuzzleClientEvent | null {
	const at = getStoredEventAt(row);

	switch (row.type) {
		case "guess_added":
		case "hint_used":
		case "text_hint_requested":
		case "bonus_clue_revealed":
		case "letters_shuffled":
		case "progress_reset":
			return {
				id: row.clientEventId,
				at,
				type: row.type,
				payload: row.payload,
			} as PuzzleClientEvent;
		default:
			return null;
	}
}

// Returns the clue text for the requested word ids, keyed by wordId. Only
// words the player has unlocked (via a spent hint or by finding them) are
// returned. Pending text_hint_requested events count too so a fetch can race
// ahead of progress sync without failing.
export async function getWordCluesData(options: {
	puzzleId: string;
	wordIds: number[];
	userId: string | null;
}): Promise<Record<number, string>> {
	const { puzzleId, userId, wordIds } = options;
	if (wordIds.length === 0) {
		return {};
	}

	const puzzleRow = await db.query.dailyPuzzles.findFirst({
		where: eq(dailyPuzzles.id, puzzleId),
		columns: { publicSnapshotJson: true },
	});
	if (!puzzleRow) {
		return {};
	}

	const validWordIds = new Set(
		puzzleRow.publicSnapshotJson.wordSlots.map((slot) => slot.id),
	);

	const authorizedWordIds = userId
		? await getAuthorizedClueWordIds({
				puzzleId,
				userId,
			})
		: null;

	const allowedWordIds = wordIds.filter((wordId) => {
		if (!validWordIds.has(wordId)) {
			return false;
		}
		if (authorizedWordIds) {
			return authorizedWordIds.has(wordId);
		}
		return true;
	});

	if (allowedWordIds.length === 0) {
		return {};
	}

	const rows = await db.query.puzzleWordClues.findMany({
		where: and(
			eq(puzzleWordClues.puzzleId, puzzleId),
			inArray(puzzleWordClues.wordId, allowedWordIds),
		),
	});

	const cluesByWordId: Record<number, string> = {};
	for (const row of rows) {
		cluesByWordId[row.wordId] = row.sonnetClue;
	}
	return cluesByWordId;
}

async function getAuthorizedClueWordIds(options: {
	puzzleId: string;
	userId: string | null;
}): Promise<Set<number>> {
	const authorized = new Set<number>();
	if (!options.userId) {
		return authorized;
	}

	const progress = await getUserPuzzleProgressData(
		options.puzzleId,
		options.userId,
	);
	if (progress) {
		for (const wordId of progress.clueWordIds) {
			authorized.add(wordId);
		}
		for (const wordId of progress.guessedWordIds) {
			authorized.add(wordId);
		}
	}

	const pendingHintEvents = await db.query.userPuzzleEvents.findMany({
		where: and(
			eq(userPuzzleEvents.userId, options.userId),
			eq(userPuzzleEvents.puzzleId, options.puzzleId),
			eq(userPuzzleEvents.type, "text_hint_requested"),
		),
		columns: { payload: true },
	});

	for (const row of pendingHintEvents) {
		const wordId =
			typeof row.payload === "object" &&
			row.payload !== null &&
			"wordId" in row.payload &&
			typeof row.payload.wordId === "number"
				? row.payload.wordId
				: null;
		if (wordId != null) {
			authorized.add(wordId);
		}
	}

	const matchedGuessEvents = await db.query.userPuzzleEvents.findMany({
		where: and(
			eq(userPuzzleEvents.userId, options.userId),
			eq(userPuzzleEvents.puzzleId, options.puzzleId),
			eq(userPuzzleEvents.type, "guess_added"),
		),
		columns: { payload: true },
	});

	for (const row of matchedGuessEvents) {
		const wordId =
			typeof row.payload === "object" &&
			row.payload !== null &&
			"matchedWordId" in row.payload &&
			typeof row.payload.matchedWordId === "number"
				? row.payload.matchedWordId
				: null;
		if (wordId != null) {
			authorized.add(wordId);
		}
	}

	return authorized;
}

export async function syncPuzzleEventsForUser(options: {
	puzzleId: string;
	userId: string;
	deviceId: string;
	events: PuzzleClientEvent[];
}) {
	const { deviceId, events, puzzleId, userId } = options;
	const puzzleRow = await db.query.dailyPuzzles.findFirst({
		where: eq(dailyPuzzles.id, puzzleId),
	});

	if (!puzzleRow) {
		throw new Error("Puzzle not found");
	}

	const privateSnapshot = puzzleRow.privateSnapshotJson;
	const publicSnapshot = puzzleRow.publicSnapshotJson;
	const eventIds = events.map((event) => event.id);
	const existingEvents =
		eventIds.length === 0
			? []
			: await db.query.userPuzzleEvents.findMany({
					where: and(
						eq(userPuzzleEvents.userId, userId),
						eq(userPuzzleEvents.puzzleId, puzzleId),
						eq(userPuzzleEvents.deviceId, deviceId),
						inArray(userPuzzleEvents.clientEventId, eventIds),
					),
				});

	const existingEventIdSet = new Set(
		existingEvents.map((event) => event.clientEventId),
	);

	const existingProgress = await getUserPuzzleProgressData(puzzleId, userId);

	const { diagnostics, filteredEvents } = await filterSyncablePuzzleEvents({
		events,
		existingEventIds: existingEventIdSet,
		publicSnapshot,
		privateSnapshot,
		existingHintState: existingProgress
			? {
					hintsUsed: existingProgress.hintsUsed,
					hintedCells: existingProgress.hintedCells,
					clueWordIds: existingProgress.clueWordIds,
				}
			: undefined,
	});

	await Promise.all(
		filteredEvents.map((event) =>
			db
				.insert(userPuzzleEvents)
				.values({
					id: crypto.randomUUID(),
					userId,
					puzzleId,
					deviceId,
					clientEventId: event.id,
					type: event.type,
					payload: {
						...event.payload,
						_eventAt: event.at,
					},
				})
				.onConflictDoNothing(),
		),
	);

	let historicalEvents: PuzzleClientEvent[] = [];

	if (!existingProgress) {
		const allEvents = await db.query.userPuzzleEvents.findMany({
			where: and(
				eq(userPuzzleEvents.userId, userId),
				eq(userPuzzleEvents.puzzleId, puzzleId),
			),
		});

		historicalEvents = allEvents
			.map((row) => toPuzzleClientEvent(row))
			.filter((event): event is PuzzleClientEvent => event !== null);
	}

	const nextProgress = buildSyncedProgressState({
		existingProgress,
		historicalEvents,
		incomingEvents: filteredEvents,
		initialProgress: createEmptyProgressState(publicSnapshot),
		totalWords: privateSnapshot.wordSlots.length,
	});

	await saveUserPuzzleProgress(userId, nextProgress);

	const ackedEventIds = collectAckedEventIds({
		existingEventIds: new Set(
			existingEvents.map((event) => event.clientEventId),
		),
		filteredEvents,
	});

	const previousWordsFound = existingProgress?.guessedWordIds.length ?? 0;
	const previousCompletedAt = existingProgress?.completedAt ?? null;
	const nextCompletedAt = nextProgress.completedAt ?? null;
	const hasProgressDelta = hasLeaderboardScoreDelta(
		{
			wordsFound: previousWordsFound,
			hintsUsed: existingProgress?.hintsUsed ?? 0,
			guessCount: existingProgress?.guessCount ?? 0,
			completed: Boolean(previousCompletedAt),
		},
		{
			wordsFound: nextProgress.guessedWordIds.length,
			hintsUsed: nextProgress.hintsUsed,
			guessCount: nextProgress.guessCount,
			completed: Boolean(nextCompletedAt),
		},
	);

	if (hasProgressDelta) {
		void publishLeaderboardForUser({
			dateKey: puzzleRow.dateKey,
			userId,
			wordsFound: nextProgress.guessedWordIds.length,
			totalWords: privateSnapshot.wordSlots.length,
			freeCluesUsed: nextProgress.hintsUsed,
			tryCount: nextProgress.guessCount,
			completedAt: nextCompletedAt,
			previousWordsFound,
			previousCompletedAt,
		});
	}

	captureServerEvent({
		distinctId: userId,
		event: "puzzle_progress_synced_server",
		properties: {
			acked_event_count: ackedEventIds.length,
			completed: Boolean(nextProgress.completedAt),
			device_id: deviceId,
			guessed_word_count: nextProgress.guessedWordIds.length,
			puzzle_id: puzzleId,
			sanitized_invalid_unlock_token_count:
				diagnostics.sanitizedInvalidUnlockTokenCount,
			sanitized_missing_word_count: diagnostics.sanitizedMissingWordCount,
			received_event_count: events.length,
		},
	});

	return {
		ackedEventIds,
		diagnostics,
		progress: {
			...nextProgress,
			lastSyncedAt: new Date().toISOString(),
		},
	};
}
