import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import {
	dailyPuzzles,
	legacyImportedResults,
	userPuzzleEvents,
	userPuzzleProgress,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { generateDailyCrosswordForSeed } from "@/lib/crossword-generator";
import { db } from "@/lib/db";
import { captureServerEvent } from "@/lib/observability-server";
import { hashText, openAnswerCapsule } from "@/lib/puzzle-crypto";
import {
	dateKeyToSeed,
	getNextRolloverAt,
	getTodayDateKey,
	getYesterdayDateKey,
} from "@/lib/puzzle-dates";
import {
	applyPuzzleEventsChronologically,
	createEmptyProgressState,
} from "@/lib/puzzle-progress";
import {
	buildPuzzleSnapshots,
	ensureHintCapsulesCoverGrid,
	toPuzzlePreview,
} from "@/lib/puzzle-snapshot";
import { filterSyncablePuzzleEvents } from "@/lib/puzzle-sync";
import type {
	AnonymousImportPayload,
	DailyPuzzlePublic,
	HistorySummaryEntry,
	PuzzleClientEvent,
	PuzzleProgressState,
	SessionUser,
} from "@/lib/puzzle-types";

export const PUZZLE_ALGORITHM_VERSION = "2";

const serverWords = allWords as Word[];

let cachedDictionaryVersion: Promise<string> | null = null;

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
		hintsUsed: row.hintsUsed,
		guessCount: row.guessCount,
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

export async function getAuthSession() {
	const headers = new Headers(getRequestHeaders());
	return auth.api.getSession({
		headers,
	});
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
	const hintCapsules = await ensureHintCapsulesCoverGrid({
		puzzleId: puzzle.publicSnapshotJson.id,
		seed: puzzle.publicSnapshotJson.seed,
		gridLetters: puzzle.privateSnapshotJson.gridLetters,
		existingHintCapsules: puzzle.publicSnapshotJson.hintCapsules,
	});

	return {
		historyEntries,
		puzzle: {
			...puzzle.publicSnapshotJson,
			hintCapsules,
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

function mergeProgressState(
	existing: PuzzleProgressState | null,
	incoming: PuzzleProgressState,
): PuzzleProgressState {
	const guessHashes = Array.from(
		new Set([
			...((existing?.guessHashes as string[]) ?? []),
			...incoming.guessHashes,
		]),
	);
	const guessedWordIds = Array.from(
		new Set([
			...((existing?.guessedWordIds as number[]) ?? []),
			...incoming.guessedWordIds,
		]),
	).sort((left, right) => left - right);

	return {
		puzzleId: incoming.puzzleId,
		guessHashes,
		guessedWordIds,
		revealedWordTokens: {
			...(existing?.revealedWordTokens ?? {}),
			...incoming.revealedWordTokens,
		},
		hintedCells: Array.from(
			new Set([...(existing?.hintedCells ?? []), ...incoming.hintedCells]),
		),
		hintsUsed: Math.max(existing?.hintsUsed ?? 0, incoming.hintsUsed),
		guessCount: guessHashes.length,
		shuffledLetters:
			incoming.shuffledLetters.length > 0
				? incoming.shuffledLetters
				: (existing?.shuffledLetters ?? []),
		completedAt: existing?.completedAt ?? incoming.completedAt,
		lastSyncedAt: incoming.lastSyncedAt,
	};
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

	const filteredEvents = await filterSyncablePuzzleEvents({
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

	const allEvents = await db.query.userPuzzleEvents.findMany({
		where: and(
			eq(userPuzzleEvents.userId, userId),
			eq(userPuzzleEvents.puzzleId, puzzleId),
		),
	});

	const nextProgress = applyPuzzleEventsChronologically(
		createEmptyProgressState(publicSnapshot),
		allEvents
			.map((row) => toPuzzleClientEvent(row))
			.filter((event): event is PuzzleClientEvent => event !== null),
		privateSnapshot.wordSlots.length,
	);

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
			hintsUsed: nextProgress.hintsUsed,
			guessCount: nextProgress.guessCount,
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
				hintsUsed: nextProgress.hintsUsed,
				guessCount: nextProgress.guessCount,
				shuffledLetters: nextProgress.shuffledLetters,
				completedAt: nextProgress.completedAt
					? new Date(nextProgress.completedAt)
					: null,
				lastSyncedAt: new Date(),
			},
		});

	const ackedEventIds = filteredEvents.map((event) => event.id);

	captureServerEvent({
		distinctId: userId,
		event: "puzzle_progress_synced_server",
		properties: {
			acked_event_count: ackedEventIds.length,
			completed: Boolean(nextProgress.completedAt),
			device_id: deviceId,
			guessed_word_count: nextProgress.guessedWordIds.length,
			puzzle_id: puzzleId,
			received_event_count: events.length,
		},
	});

	return {
		ackedEventIds,
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

	return entries.sort((left, right) =>
		right.dateKey.localeCompare(left.dateKey),
	);
}

export async function getHistoryPageDataForUser(
	userId?: string,
	dateKey = getYesterdayDateKey(),
) {
	const yesterdayPuzzleRow = await ensureDailyPuzzleSnapshot(dateKey);
	const accountHistory = userId ? await getHistoryEntriesForUser(userId) : null;

	captureServerEvent({
		distinctId: userId,
		event: "history_page_loaded_server",
		properties: {
			date_key: dateKey,
			has_account_history: Boolean(accountHistory),
			history_entry_count: accountHistory?.length ?? 0,
		},
	});

	return {
		accountHistory,
		yesterdayPuzzle: {
			dateKey: yesterdayPuzzleRow.dateKey,
			preview: toPuzzlePreview(yesterdayPuzzleRow.privateSnapshotJson),
		},
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
		const existingProgress = await getUserPuzzleProgressData(puzzle.id, userId);
		const merged = mergeProgressState(existingProgress, activeProgress);

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
