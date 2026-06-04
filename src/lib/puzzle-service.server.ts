import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import { user } from "@/db/auth-schema";
import {
	dailyPuzzles,
	legacyImportedResults,
	puzzleWordClues,
	userPuzzleEvents,
	userPuzzleProgress,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { getClueInbox } from "@/lib/clue-request.server";
import { generateAndStoreCluesForPuzzle } from "@/lib/clue-generator.server";
import { generateDailyCrosswordForSeed } from "@/lib/crossword-generator";
import { db } from "@/lib/db";
import {
	getLeaderboard,
	recordProgress as recordLeaderboardProgress,
	userParticipantId,
} from "@/lib/leaderboard.server";
import {
	captureServerEvent,
	captureServerException,
} from "@/lib/observability-server";
import { hashText, openAnswerCapsule } from "@/lib/puzzle-crypto";
import {
	dateKeyToSeed,
	getNextRolloverAt,
	getTodayDateKey,
	getYesterdayDateKey,
} from "@/lib/puzzle-dates";
import {
	buildNormalizedDictionary,
	getValidNormalizedGuessesForLetters,
} from "@/lib/puzzle-dictionary";
import {
	buildSyncedProgressState,
	createEmptyProgressState,
	getCompatibleProgress,
	mergeProgressStates,
} from "@/lib/puzzle-progress";
import {
	buildPuzzleSnapshots,
	ensureHintCapsulesCoverGrid,
	hydratePublicSnapshotWordMetadata,
	toPuzzlePreview,
} from "@/lib/puzzle-snapshot";
import {
	collectAckedEventIds,
	filterSyncablePuzzleEvents,
} from "@/lib/puzzle-sync";
import type {
	AnonymousImportPayload,
	DailyPuzzlePrivateWord,
	DailyPuzzlePublic,
	HistorySummaryEntry,
	PuzzleClientEvent,
	PuzzleProgressState,
	SessionUser,
} from "@/lib/puzzle-types";

export const PUZZLE_ALGORITHM_VERSION = "3";

const serverWords = allWords as Word[];
const normalizedServerWords = buildNormalizedDictionary(serverWords);

let cachedDictionaryVersion: Promise<string> | null = null;
const validNormalizedGuessesCache = new Map<string, string[]>();
const inProgressGenerations = new Map<string, Promise<void>>();
const cluesGenerationStarted = new Set<string>();

// Fire-and-forget AI clue generation for a freshly created puzzle. Never blocks
// or fails puzzle creation: a missing API key or API error only means clues are
// absent (players fall back to letter hints).
function triggerCluesGeneration(
	puzzleId: string,
	wordSlots: DailyPuzzlePrivateWord[],
): void {
	if (cluesGenerationStarted.has(puzzleId)) return;
	cluesGenerationStarted.add(puzzleId);

	void generateAndStoreCluesForPuzzle({ puzzleId, wordSlots })
		.catch((error: unknown) => {
			console.error(
				`[puzzle-service] Clue generation failed for puzzle ${puzzleId}:`,
				error,
			);
			captureServerException(error, {
				properties: { puzzle_id: puzzleId, scope: "clue_generation" },
			});
		})
		.finally(() => {
			cluesGenerationStarted.delete(puzzleId);
		});
}

function toSessionUser(
	sessionData: Awaited<ReturnType<typeof getAuthSession>>,
): SessionUser {
	return sessionData
		? {
				id: sessionData.user.id,
				name: sessionData.user.name,
				email: sessionData.user.email,
				image: sessionData.user.image,
			}
		: null;
}

function serializeProgressRow(
	row: typeof userPuzzleProgress.$inferSelect,
): PuzzleProgressState {
	return {
		puzzleId: row.puzzleId,
		guessHashes: row.guessHashes,
		guessedWordIds: row.guessedWordIds,
		revealedWordTokens: row.revealedWordTokens,
		hintedCells: row.hintedCells,
		clueWordIds: row.clueWordIds,
		hintsUsed: row.hintsUsed,
		guessCount: row.guessCount,
		bonusWordsFound: row.bonusWordsFound,
		shuffledLetters: row.shuffledLetters,
		completedAt: row.completedAt?.toISOString() ?? null,
		lastSyncedAt: row.lastSyncedAt.toISOString(),
	};
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

async function getDictionaryVersion() {
	if (!cachedDictionaryVersion) {
		cachedDictionaryVersion = hashText(
			JSON.stringify(
				serverWords.map((word) => ({
					name: word.name,
					areatematica: word.areatematica,
					frequency: word.frequency,
				})),
			),
		);
	}

	return cachedDictionaryVersion;
}

function getDailyValidNormalizedGuesses(letters: string[]) {
	const cacheKey = [...letters].sort().join("");
	const cachedGuesses = validNormalizedGuessesCache.get(cacheKey);

	if (cachedGuesses) {
		return cachedGuesses;
	}

	const validGuesses = getValidNormalizedGuessesForLetters(
		normalizedServerWords,
		letters,
	);
	validNormalizedGuessesCache.set(cacheKey, validGuesses);
	return validGuesses;
}

export async function getAuthSession() {
	const headers = new Headers(getRequestHeaders());
	return auth.api.getSession({
		headers,
	});
}

async function publishLeaderboardForUser(input: {
	dateKey: string;
	userId: string;
	wordsFound: number;
	totalWords: number;
	freeCluesUsed: number;
	tryCount: number;
	completedAt: string | null;
	previousWordsFound: number;
	previousCompletedAt: string | null;
}) {
	try {
		const profiles = await db
			.select({ name: user.name, image: user.image })
			.from(user)
			.where(eq(user.id, input.userId))
			.limit(1);
		const profile = profiles[0];
		if (!profile) return;

		// Total clues = the free clues spent plus every clue a friend delivered
		// (one inbox entry per word).
		const friendClues = (await getClueInbox(input.userId, input.dateKey))
			.length;

		await recordLeaderboardProgress({
			dateKey: input.dateKey,
			participantId: userParticipantId(input.userId),
			kind: "user",
			name: profile.name,
			image: profile.image ?? null,
			wordsFound: input.wordsFound,
			totalWords: input.totalWords,
			clueCount: input.freeCluesUsed + friendClues,
			tryCount: input.tryCount,
			completedAt: input.completedAt,
			previousWordsFound: input.previousWordsFound,
			previousCompletedAt: input.previousCompletedAt,
		});
	} catch (error) {
		console.warn("[leaderboard] publish for user failed", error);
	}
}

export async function checkDailyPuzzleExists(
	dateKey = getTodayDateKey(),
): Promise<boolean> {
	const existing = await db.query.dailyPuzzles.findFirst({
		where: eq(dailyPuzzles.dateKey, dateKey),
		columns: { id: true },
	});
	return existing != null;
}

export function triggerDailyPuzzleGeneration(
	dateKey = getTodayDateKey(),
): void {
	if (inProgressGenerations.has(dateKey)) return;

	const promise = ensureDailyPuzzleSnapshot(dateKey)
		.then(() => {})
		.catch((err: unknown) => {
			console.error(
				`[puzzle-scheduler] Puzzle generation failed for ${dateKey}:`,
				err,
			);
		})
		.finally(() => {
			inProgressGenerations.delete(dateKey);
		});

	inProgressGenerations.set(dateKey, promise);
}

export async function ensureDailyPuzzleSnapshot(dateKey = getTodayDateKey()) {
	const existing = await db.query.dailyPuzzles.findFirst({
		where: eq(dailyPuzzles.dateKey, dateKey),
	});

	if (existing) {
		return existing;
	}

	const seed = dateKeyToSeed(dateKey);
	const generated = generateDailyCrosswordForSeed(serverWords, seed);

	if (!generated) {
		throw new Error(`Failed to generate puzzle for ${dateKey}`);
	}

	const puzzleId = crypto.randomUUID();
	const { publicSnapshot, privateSnapshot } = await buildPuzzleSnapshots({
		puzzleId,
		dateKey,
		seed,
		crossword: generated.crossword,
		letters: generated.letters,
		initialShuffledLetters: generated.shuffledLetters,
		algorithmVersion: PUZZLE_ALGORITHM_VERSION,
	});

	const inserted = await db
		.insert(dailyPuzzles)
		.values({
			id: puzzleId,
			dateKey,
			seed,
			algorithmVersion: PUZZLE_ALGORITHM_VERSION,
			dictionaryVersion: await getDictionaryVersion(),
			wordCount: privateSnapshot.wordSlots.length,
			publicSnapshotJson: publicSnapshot,
			privateSnapshotJson: privateSnapshot,
		})
		.onConflictDoNothing({
			target: dailyPuzzles.dateKey,
		})
		.returning();

	if (inserted[0]) {
		captureServerEvent({
			event: "daily_puzzle_generated",
			properties: {
				date_key: dateKey,
				puzzle_id: inserted[0].id,
				seed,
				word_count: privateSnapshot.wordSlots.length,
			},
		});
		triggerCluesGeneration(inserted[0].id, privateSnapshot.wordSlots);
		return inserted[0];
	}

	const conflictRow = await db.query.dailyPuzzles.findFirst({
		where: eq(dailyPuzzles.dateKey, dateKey),
	});

	if (!conflictRow) {
		throw new Error(`Failed to persist puzzle for ${dateKey}`);
	}

	return conflictRow;
}

export async function getDailyPuzzlePublicData(dateKey = getTodayDateKey()) {
	const puzzle = await ensureDailyPuzzleSnapshot(dateKey);
	const sessionData = await getAuthSession();
	const historyEntries = sessionData
		? await getHistoryEntriesForUser(sessionData.user.id)
		: null;
	const publicSnapshot = hydratePublicSnapshotWordMetadata({
		publicSnapshot: puzzle.publicSnapshotJson,
		privateSnapshot: puzzle.privateSnapshotJson,
	});
	const hintCapsules = await ensureHintCapsulesCoverGrid({
		puzzleId: publicSnapshot.id,
		seed: publicSnapshot.seed,
		gridLetters: puzzle.privateSnapshotJson.gridLetters,
		existingHintCapsules: publicSnapshot.hintCapsules,
	});

	return {
		historyEntries,
		puzzle: {
			...publicSnapshot,
			hintCapsules,
			validNormalizedGuesses: getDailyValidNormalizedGuesses(
				publicSnapshot.letters,
			),
		},
		rolloverAt: getNextRolloverAt().toISOString(),
		sessionUser: toSessionUser(sessionData),
	};
}

export async function getSessionUserData() {
	return toSessionUser(await getAuthSession());
}

export async function getUserPuzzleProgressData(
	puzzleId: string,
	userId: string,
) {
	const row = await db.query.userPuzzleProgress.findFirst({
		where: and(
			eq(userPuzzleProgress.puzzleId, puzzleId),
			eq(userPuzzleProgress.userId, userId),
		),
	});

	return row ? serializeProgressRow(row) : null;
}

// Returns the clue text for the requested word ids, keyed by wordId. The caller
// passes the words it has unlocked (its local clueWordIds), which avoids racing
// the asynchronous progress sync.
export async function getWordCluesData(
	puzzleId: string,
	wordIds: number[],
): Promise<Record<number, string>> {
	if (wordIds.length === 0) {
		return {};
	}

	const rows = await db.query.puzzleWordClues.findMany({
		where: and(
			eq(puzzleWordClues.puzzleId, puzzleId),
			inArray(puzzleWordClues.wordId, wordIds),
		),
	});

	const cluesByWordId: Record<number, string> = {};
	for (const row of rows) {
		cluesByWordId[row.wordId] = row.sonnetClue;
	}
	return cluesByWordId;
}

export async function syncPuzzleEventsForUser(options: {
	puzzleId: string;
	userId: string;
	deviceId: string;
	events: PuzzleClientEvent[];
	leaderboardOptOut?: boolean;
}) {
	const { deviceId, events, puzzleId, userId } = options;
	const leaderboardOptOut = options.leaderboardOptOut ?? false;
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

	const { diagnostics, filteredEvents } = await filterSyncablePuzzleEvents({
		events,
		existingEventIds: existingEventIdSet,
		publicSnapshot,
		privateSnapshot,
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

	const existingProgress = await getUserPuzzleProgressData(puzzleId, userId);
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

	await db
		.insert(userPuzzleProgress)
		.values({
			id: `${userId}:${puzzleId}`,
			userId,
			puzzleId,
			guessHashes: nextProgress.guessHashes,
			guessedWordIds: nextProgress.guessedWordIds,
			revealedWordTokens: nextProgress.revealedWordTokens,
			hintedCells: nextProgress.hintedCells,
			clueWordIds: nextProgress.clueWordIds,
			hintsUsed: nextProgress.hintsUsed,
			guessCount: nextProgress.guessCount,
			bonusWordsFound: nextProgress.bonusWordsFound,
			shuffledLetters: nextProgress.shuffledLetters,
			completedAt: nextProgress.completedAt
				? new Date(nextProgress.completedAt)
				: null,
			lastSyncedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: userPuzzleProgress.id,
			set: {
				guessHashes: nextProgress.guessHashes,
				guessedWordIds: nextProgress.guessedWordIds,
				revealedWordTokens: nextProgress.revealedWordTokens,
				hintedCells: nextProgress.hintedCells,
				clueWordIds: nextProgress.clueWordIds,
				hintsUsed: nextProgress.hintsUsed,
				guessCount: nextProgress.guessCount,
				bonusWordsFound: nextProgress.bonusWordsFound,
				shuffledLetters: nextProgress.shuffledLetters,
				completedAt: nextProgress.completedAt
					? new Date(nextProgress.completedAt)
					: null,
				lastSyncedAt: new Date(),
			},
		});

	const ackedEventIds = collectAckedEventIds({
		existingEventIds: new Set(
			existingEvents.map((event) => event.clientEventId),
		),
		filteredEvents,
	});

	const previousWordsFound = existingProgress?.guessedWordIds.length ?? 0;
	const previousCompletedAt = existingProgress?.completedAt ?? null;
	const nextCompletedAt = nextProgress.completedAt ?? null;
	const hasProgressDelta =
		nextProgress.guessedWordIds.length > previousWordsFound ||
		(Boolean(nextCompletedAt) && !previousCompletedAt);

	if (hasProgressDelta && !leaderboardOptOut) {
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

export async function getHistoryPageDataForUser(
	userId?: string,
	dateKey = getYesterdayDateKey(),
) {
	const yesterdayPuzzleRow = await ensureDailyPuzzleSnapshot(dateKey);
	const accountHistory = userId ? await getHistoryEntriesForUser(userId) : null;
	const yesterdayLeaderboard = await getLeaderboard(yesterdayPuzzleRow.dateKey);

	captureServerEvent({
		distinctId: userId,
		event: "history_page_loaded_server",
		properties: {
			date_key: dateKey,
			has_account_history: Boolean(accountHistory),
			history_entry_count: accountHistory?.length ?? 0,
			yesterday_leaderboard_entry_count: yesterdayLeaderboard.entries.length,
		},
	});

	return {
		accountHistory,
		yesterdayPuzzle: {
			dateKey: yesterdayPuzzleRow.dateKey,
			preview: toPuzzlePreview(yesterdayPuzzleRow.privateSnapshotJson),
		},
		yesterdayLeaderboard,
	};
}

export async function importAnonymousProgressForUser(options: {
	userId: string;
	payload: AnonymousImportPayload;
}) {
	const { payload, userId } = options;
	const importedDates: string[] = [];
	const skippedLegacyDates: string[] = [];

	for (const historyEntry of payload.historyEntries) {
		const activeProgress = payload.activeProgressByDate[historyEntry.dateKey];
		if (!activeProgress) {
			await db
				.insert(legacyImportedResults)
				.values({
					id: crypto.randomUUID(),
					userId,
					dateKey: historyEntry.dateKey,
					seed: historyEntry.seed,
					totalWords: historyEntry.totalWords,
					guessedWords: historyEntry.guessedWords,
					guessCount: historyEntry.guessCount,
					hintsUsed: historyEntry.hintsUsed,
					completed: historyEntry.completed,
					lastUpdated: new Date(historyEntry.lastUpdated),
				})
				.onConflictDoUpdate({
					target: [legacyImportedResults.userId, legacyImportedResults.dateKey],
					set: {
						seed: historyEntry.seed,
						totalWords: historyEntry.totalWords,
						guessedWords: historyEntry.guessedWords,
						guessCount: historyEntry.guessCount,
						hintsUsed: historyEntry.hintsUsed,
						completed: historyEntry.completed,
						lastUpdated: new Date(historyEntry.lastUpdated),
					},
				});
			skippedLegacyDates.push(historyEntry.dateKey);
			continue;
		}

		const puzzle = await ensureDailyPuzzleSnapshot(historyEntry.dateKey);
		if (!getCompatibleProgress(activeProgress, puzzle.publicSnapshotJson)) {
			await db
				.insert(legacyImportedResults)
				.values({
					id: crypto.randomUUID(),
					userId,
					dateKey: historyEntry.dateKey,
					seed: historyEntry.seed,
					totalWords: historyEntry.totalWords,
					guessedWords: historyEntry.guessedWords,
					guessCount: historyEntry.guessCount,
					hintsUsed: historyEntry.hintsUsed,
					completed: historyEntry.completed,
					lastUpdated: new Date(historyEntry.lastUpdated),
				})
				.onConflictDoUpdate({
					target: [legacyImportedResults.userId, legacyImportedResults.dateKey],
					set: {
						seed: historyEntry.seed,
						totalWords: historyEntry.totalWords,
						guessedWords: historyEntry.guessedWords,
						guessCount: historyEntry.guessCount,
						hintsUsed: historyEntry.hintsUsed,
						completed: historyEntry.completed,
						lastUpdated: new Date(historyEntry.lastUpdated),
					},
				});
			skippedLegacyDates.push(historyEntry.dateKey);
			continue;
		}

		const existingProgress = await getUserPuzzleProgressData(puzzle.id, userId);
		const merged = mergeProgressStates(existingProgress, activeProgress);

		await db
			.insert(userPuzzleProgress)
			.values({
				id: `${userId}:${puzzle.id}`,
				userId,
				puzzleId: puzzle.id,
				guessHashes: merged.guessHashes,
				guessedWordIds: merged.guessedWordIds,
				revealedWordTokens: merged.revealedWordTokens,
				hintedCells: merged.hintedCells,
				hintsUsed: merged.hintsUsed,
				guessCount: merged.guessCount,
				bonusWordsFound: merged.bonusWordsFound,
				shuffledLetters: merged.shuffledLetters,
				completedAt: merged.completedAt ? new Date(merged.completedAt) : null,
				lastSyncedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: userPuzzleProgress.id,
				set: {
					guessHashes: merged.guessHashes,
					guessedWordIds: merged.guessedWordIds,
					revealedWordTokens: merged.revealedWordTokens,
					hintedCells: merged.hintedCells,
					hintsUsed: merged.hintsUsed,
					guessCount: merged.guessCount,
					bonusWordsFound: merged.bonusWordsFound,
					shuffledLetters: merged.shuffledLetters,
					completedAt: merged.completedAt ? new Date(merged.completedAt) : null,
					lastSyncedAt: new Date(),
				},
			});

		importedDates.push(historyEntry.dateKey);
	}

	captureServerEvent({
		distinctId: userId,
		event: "anonymous_progress_imported_server",
		properties: {
			active_progress_count: Object.keys(payload.activeProgressByDate).length,
			imported_dates: importedDates.length,
			legacy_dates: skippedLegacyDates.length,
		},
	});

	return {
		importedDates,
		skippedLegacyDates,
	};
}

export async function decodeRevealedWords(
	puzzle: DailyPuzzlePublic,
	progress: PuzzleProgressState,
) {
	const entries = await Promise.all(
		puzzle.wordSlots
			.filter((slot) => progress.guessedWordIds.includes(slot.id))
			.map(async (slot) => {
				const unlockToken = progress.revealedWordTokens[String(slot.id)];
				if (!unlockToken) return null;
				return [
					slot.id,
					await openAnswerCapsule(slot.answerCapsule, unlockToken),
				] as const;
			}),
	);

	return Object.fromEntries(
		entries.filter(Boolean) as Array<readonly [number, string]>,
	);
}
