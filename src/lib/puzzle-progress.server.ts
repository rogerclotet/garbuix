import { and, count, eq, inArray } from "drizzle-orm";
import { dailyPuzzles, puzzleWordClues, userPuzzleEvents } from "@/db/schema";
import { db } from "@/lib/db";
import { createGuessHash } from "@/lib/puzzle-crypto";
import { puzzleClientEventSchema } from "@/lib/puzzle-event-schemas";
import { getDailyValidNormalizedGuesses } from "@/lib/puzzle-generation.server";
import { publishLeaderboardForUser } from "@/lib/puzzle-leaderboard.server";
import {
	buildSyncedProgressState,
	createEmptyProgressState,
} from "@/lib/puzzle-progress";
import {
	getUserPuzzleProgressData,
	type ProgressTransaction,
	saveUserPuzzleProgress,
	withPuzzleProgressTransaction,
} from "@/lib/puzzle-progress-store.server";
import {
	collectAckedEventIds,
	filterSyncablePuzzleEvents,
	hasLeaderboardScoreDelta,
} from "@/lib/puzzle-sync";
import type { DailyPuzzlePrivate, PuzzleClientEvent } from "@/lib/puzzle-types";

// Guess hashes of the valid words that aren't answers: the only guesses that
// count toward a bonus clue. Only computed when a batch claims one.
async function getBonusGuessHashes(
	puzzleId: string,
	privateSnapshot: DailyPuzzlePrivate,
	events: PuzzleClientEvent[],
): Promise<ReadonlySet<string>> {
	const claimsBonusWord = events.some(
		(event) => event.type === "guess_added" && event.payload.validNotInPuzzle,
	);
	if (!claimsBonusWord) return new Set();

	const answers = new Set(
		privateSnapshot.wordSlots.map((slot) => slot.normalizedWord),
	);
	const bonusWords = getDailyValidNormalizedGuesses(
		privateSnapshot.letters,
	).filter((word) => !answers.has(word));
	return new Set(
		await Promise.all(
			bonusWords.map((word) => createGuessHash(puzzleId, word)),
		),
	);
}

// Rejected reveals are never stored, so the stored rows are the reveals spent.
async function countStoredBonusClues(
	transaction: ProgressTransaction,
	options: { userId: string; puzzleId: string; events: PuzzleClientEvent[] },
): Promise<number> {
	if (!options.events.some((event) => event.type === "bonus_clue_revealed")) {
		return 0;
	}

	const [row] = await transaction
		.select({ value: count() })
		.from(userPuzzleEvents)
		.where(
			and(
				eq(userPuzzleEvents.userId, options.userId),
				eq(userPuzzleEvents.puzzleId, options.puzzleId),
				eq(userPuzzleEvents.type, "bonus_clue_revealed"),
			),
		);
	return row?.value ?? 0;
}

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
	const parsed = puzzleClientEventSchema.safeParse({
		id: row.clientEventId,
		at: getStoredEventAt(row),
		type: row.type,
		payload: row.payload,
	});
	return parsed.success ? parsed.data : null;
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

	const {
		puzzleRow,
		existingProgress,
		nextProgress,
		ackedEventIds,
		diagnostics,
	} = await withPuzzleProgressTransaction(
		{ userId, puzzleId },
		async (transaction) => {
			const puzzleRow = await transaction.query.dailyPuzzles.findFirst({
				where: eq(dailyPuzzles.id, puzzleId),
			});
			if (!puzzleRow) throw new Error("Puzzle not found");
			const privateSnapshot = puzzleRow.privateSnapshotJson;
			const publicSnapshot = puzzleRow.publicSnapshotJson;
			const existingProgress = await getUserPuzzleProgressData(
				puzzleId,
				userId,
				transaction,
			);
			let historicalEvents: PuzzleClientEvent[] = [];
			if (!existingProgress) {
				const rows = await transaction.query.userPuzzleEvents.findMany({
					where: and(
						eq(userPuzzleEvents.userId, userId),
						eq(userPuzzleEvents.puzzleId, puzzleId),
					),
				});
				historicalEvents = rows
					.map(toPuzzleClientEvent)
					.filter((event) => event !== null);
			}
			// Recover the projection before validating hints, so retries and rebuilt
			// rows use the same budget as an ordinary sync. Incoming events are only
			// applied once, after validation and deduplication under the lock.
			const baseProgress = buildSyncedProgressState({
				existingProgress,
				historicalEvents,
				incomingEvents: [],
				initialProgress: createEmptyProgressState(publicSnapshot),
				totalWords: privateSnapshot.wordSlots.length,
			});
			const eventIds = events.map((event) => event.id);
			const existingEvents =
				eventIds.length === 0
					? []
					: await transaction.query.userPuzzleEvents.findMany({
							where: and(
								eq(userPuzzleEvents.userId, userId),
								eq(userPuzzleEvents.puzzleId, puzzleId),
								eq(userPuzzleEvents.deviceId, deviceId),
								inArray(userPuzzleEvents.clientEventId, eventIds),
							),
						});
			const existingEventIds = new Set(
				existingEvents.map((event) => event.clientEventId),
			);
			const { diagnostics, filteredEvents, rejectedEventIds } =
				await filterSyncablePuzzleEvents({
					events,
					existingEventIds,
					publicSnapshot,
					privateSnapshot,
					existingHintState: baseProgress,
					existingBonusCluesRevealed: await countStoredBonusClues(transaction, {
						userId,
						puzzleId,
						events,
					}),
					bonusGuessHashes: await getBonusGuessHashes(
						puzzleId,
						privateSnapshot,
						events,
					),
				});
			if (filteredEvents.length > 0) {
				await transaction
					.insert(userPuzzleEvents)
					.values(
						filteredEvents.map((event) => ({
							id: crypto.randomUUID(),
							userId,
							puzzleId,
							deviceId,
							clientEventId: event.id,
							type: event.type,
							payload: { ...event.payload, _eventAt: event.at },
						})),
					)
					.onConflictDoNothing();
			}
			const nextProgress = await saveUserPuzzleProgress(
				userId,
				buildSyncedProgressState({
					existingProgress: baseProgress,
					incomingEvents: filteredEvents,
					initialProgress: baseProgress,
					totalWords: privateSnapshot.wordSlots.length,
				}),
				transaction,
			);
			return {
				puzzleRow,
				existingProgress,
				nextProgress,
				diagnostics,
				ackedEventIds: collectAckedEventIds({
					existingEventIds,
					filteredEvents,
					rejectedEventIds,
				}),
			};
		},
	);

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
			puzzleId: puzzleRow.id,
			wordsFound: nextProgress.guessedWordIds.length,
			totalWords: puzzleRow.privateSnapshotJson.wordSlots.length,
			freeCluesUsed: nextProgress.hintsUsed,
			tryCount: nextProgress.guessCount,
			completedAt: nextCompletedAt,
			previousWordsFound,
			previousCompletedAt,
		});
	}

	return {
		ackedEventIds,
		diagnostics,
		progress: nextProgress,
	};
}
