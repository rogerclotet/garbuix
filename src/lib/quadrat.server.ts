import { captureException } from "@sentry/tanstackstart-react";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import guessWords from "@/data/catalan-guess-words.json";
import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import { quadratProgress, quadratPuzzles, quadratWordClues } from "@/db/schema";
import {
	type ClueWord,
	generateAndStoreClues,
} from "@/lib/clue-generator.server";
import { HISTORY_LOOKBACK_DAYS } from "@/lib/crossword-generator";
import { db } from "@/lib/db";
import { createGuessHash, createUnlockToken } from "@/lib/puzzle-crypto";
import {
	addDaysToDateKey,
	countDaysBetween,
	dateKeyToSeed,
	getTodayDateKey,
	isPlayableDateKey,
} from "@/lib/puzzle-dates";
import { buildNormalizedDictionary } from "@/lib/puzzle-dictionary";
import type {
	HistorySummaryEntry,
	PuzzleProgressState,
} from "@/lib/puzzle-types";
import {
	findQuadratValidGuesses,
	generateQuadratPuzzle,
	QUADRAT_ALGORITHM_VERSION,
	type QuadratHistoryEntry,
} from "@/lib/quadrat-generator";
import { quadratPuzzleId } from "@/lib/quadrat-local";
import {
	mergeQuadratProgress,
	QUADRAT_CLUE_LIMIT,
} from "@/lib/quadrat-progress";
import { buildQuadratSnapshots } from "@/lib/quadrat-snapshot";
import type { QuadratPuzzlePublic } from "@/lib/quadrat-types";
import { trackBackgroundTask } from "@/lib/shutdown.server";
import { recordSyncedProgressUsage } from "@/lib/usage-stats.server";

export type QuadratPuzzleRow = typeof quadratPuzzles.$inferSelect;

let normalizedGuessWords: string[] | null = null;
const clueGenerationsInProgress = new Set<string>();

function getNormalizedGuessWords(): string[] {
	normalizedGuessWords ??= buildNormalizedDictionary(guessWords);
	return normalizedGuessWords;
}

async function findQuadratPuzzle(
	dateKey: string,
): Promise<QuadratPuzzleRow | undefined> {
	return db.query.quadratPuzzles.findFirst({
		where: eq(quadratPuzzles.dateKey, dateKey),
	});
}

async function getRecentHistory(
	dateKey: string,
): Promise<QuadratHistoryEntry[]> {
	const rows = await db
		.select({
			dateKey: quadratPuzzles.dateKey,
			privateSnapshot: quadratPuzzles.privateSnapshotJson,
		})
		.from(quadratPuzzles)
		.where(
			and(
				gte(
					quadratPuzzles.dateKey,
					addDaysToDateKey(dateKey, -HISTORY_LOOKBACK_DAYS),
				),
				lt(quadratPuzzles.dateKey, dateKey),
			),
		);
	return rows.map((row) => ({
		daysAgo: countDaysBetween(row.dateKey, dateKey),
		normalizedWords: row.privateSnapshot.words.map(
			(word) => word.normalizedWord,
		),
	}));
}

// Returns the stored board for the day, generating it on first request.
// created tells the caller whether this call wrote it.
async function getOrCreateQuadratPuzzle(
	dateKey: string,
): Promise<{ row: QuadratPuzzleRow; created: boolean }> {
	const existing = await findQuadratPuzzle(dateKey);
	if (existing) return { row: existing, created: false };

	const seed = dateKeyToSeed(dateKey);
	const generated = generateQuadratPuzzle(allWords as Word[], seed, {
		recentHistory: await getRecentHistory(dateKey),
	});
	const id = quadratPuzzleId(dateKey);
	const { publicSnapshot, privateSnapshot } = await buildQuadratSnapshots({
		puzzleId: id,
		dateKey,
		seed,
		algorithmVersion: QUADRAT_ALGORITHM_VERSION,
		generated,
		validNormalizedGuesses: findQuadratValidGuesses({
			letters: generated.letters,
			connections: generated.connections,
			normalizedWords: getNormalizedGuessWords(),
			targetWords: generated.words.map((word) => word.normalizedWord),
		}),
	});
	const inserted = await db
		.insert(quadratPuzzles)
		.values({
			id,
			dateKey,
			publicSnapshotJson: publicSnapshot,
			privateSnapshotJson: privateSnapshot,
		})
		.onConflictDoNothing()
		.returning({ id: quadratPuzzles.id });
	// Read the winner of a concurrent generation, including its salts.
	const saved = await findQuadratPuzzle(dateKey);
	if (!saved) throw new Error(`Quadrat puzzle ${id} was not saved`);
	return { row: saved, created: inserted.length > 0 };
}

export async function ensureQuadratPuzzle(
	dateKey = getTodayDateKey(),
): Promise<QuadratPuzzleRow> {
	if (!isPlayableDateKey(dateKey)) {
		throw new Error(`Quadrat date ${dateKey} is not playable`);
	}
	const { row, created } = await getOrCreateQuadratPuzzle(dateKey);
	// The nightly job normally writes the board and its clues first. A board
	// created by a visit gets its clues in the background.
	if (created) triggerQuadratClueGeneration(row);
	return row;
}

// For the nightly job, which prepares tomorrow before anyone can play it.
export async function pregenerateQuadratPuzzle(
	dateKey: string,
): Promise<QuadratPuzzleRow> {
	return (await getOrCreateQuadratPuzzle(dateKey)).row;
}

// Skips words that already have a clue unless replaceExisting is set, so a
// rerun spends nothing on clues it already has.
export async function generateQuadratClues(
	row: QuadratPuzzleRow,
	options: { replaceExisting?: boolean } = {},
): Promise<void> {
	const existing = options.replaceExisting
		? new Set<number>()
		: new Set(
				(
					await db
						.select({ wordId: quadratWordClues.wordId })
						.from(quadratWordClues)
						.where(eq(quadratWordClues.puzzleId, row.id))
				).map(({ wordId }) => wordId),
			);
	const words: ClueWord[] = row.privateSnapshotJson.words.filter(
		(word) => !existing.has(word.id),
	);
	if (words.length === 0) return;

	await generateAndStoreClues({
		puzzleId: row.id,
		words,
		storeClue: async (word, generated) => {
			const insert = db.insert(quadratWordClues).values({
				id: crypto.randomUUID(),
				puzzleId: row.id,
				wordId: word.id,
				normalizedWord: word.normalizedWord,
				model: generated.model,
				clue: generated.clue,
			});
			if (options.replaceExisting) {
				await insert.onConflictDoUpdate({
					target: [quadratWordClues.puzzleId, quadratWordClues.wordId],
					set: {
						normalizedWord: word.normalizedWord,
						model: generated.model,
						clue: generated.clue,
						createdAt: new Date(),
					},
				});
				return;
			}
			await insert.onConflictDoNothing({
				target: [quadratWordClues.puzzleId, quadratWordClues.wordId],
			});
		},
	});
}

function triggerQuadratClueGeneration(row: QuadratPuzzleRow): void {
	if (clueGenerationsInProgress.has(row.id)) return;
	clueGenerationsInProgress.add(row.id);
	const generation = generateQuadratClues(row)
		.catch((error: unknown) => {
			// Without clues the hint still lights the word's first letter.
			captureException(error);
			console.error(
				`[quadrat] Clue generation failed for puzzle ${row.id}:`,
				error,
			);
		})
		.finally(() => {
			clueGenerationsInProgress.delete(row.id);
		});
	trackBackgroundTask(generation);
}

export async function getQuadratProgress(
	userId: string,
	puzzleId: string,
): Promise<PuzzleProgressState | null> {
	const row = await db.query.quadratProgress.findFirst({
		where: and(
			eq(quadratProgress.userId, userId),
			eq(quadratProgress.puzzleId, puzzleId),
		),
	});
	return row?.progressJson ?? null;
}

function toHistoryEntry(
	puzzle: QuadratPuzzlePublic,
	progress: PuzzleProgressState,
): HistorySummaryEntry {
	return {
		dateKey: puzzle.dateKey,
		seed: puzzle.seed,
		totalWords: puzzle.wordSlots.length,
		guessedWords: progress.guessedWordIds.length,
		guessCount: progress.guessCount,
		hintsUsed: progress.hintsUsed,
		completed: progress.guessedWordIds.length >= puzzle.wordSlots.length,
		lastUpdated: progress.lastSyncedAt ?? new Date().toISOString(),
	};
}

export async function getQuadratHistory(
	userId: string,
): Promise<HistorySummaryEntry[]> {
	const rows = await db
		.select({
			puzzle: quadratPuzzles.publicSnapshotJson,
			progress: quadratProgress.progressJson,
		})
		.from(quadratProgress)
		.innerJoin(quadratPuzzles, eq(quadratProgress.puzzleId, quadratPuzzles.id))
		.where(eq(quadratProgress.userId, userId))
		.orderBy(desc(quadratPuzzles.dateKey));
	return rows.map(({ puzzle, progress }) => toHistoryEntry(puzzle, progress));
}

// A finished day's board with its words, for the history page.
export async function getQuadratSolution(dateKey: string) {
	const row = await findQuadratPuzzle(dateKey);
	if (!row || dateKey >= getTodayDateKey()) return null;
	return {
		dateKey: row.dateKey,
		letters: row.privateSnapshotJson.letters,
		words: row.privateSnapshotJson.words
			.map((word) => word.displayWord)
			.sort((left, right) => left.localeCompare(right, "ca")),
	};
}

export async function saveQuadratProgress(
	userId: string,
	incoming: PuzzleProgressState,
): Promise<PuzzleProgressState> {
	const row = await db.query.quadratPuzzles.findFirst({
		where: eq(quadratPuzzles.id, incoming.puzzleId),
	});
	if (!row || row.dateKey > getTodayDateKey()) {
		throw new Error(`Quadrat puzzle ${incoming.puzzleId} not found`);
	}
	const puzzle = row.publicSnapshotJson;
	// Validate claims at the storage boundary, using the persisted answers.
	const tokens: Record<string, string> = {};
	const guessedWordIds: number[] = [];
	for (const slot of puzzle.wordSlots) {
		const answer = row.privateSnapshotJson.words.find(
			(word) => word.id === slot.id,
		);
		if (!answer || !incoming.guessedWordIds.includes(slot.id)) continue;
		const token = await createUnlockToken(slot.slotSalt, answer.normalizedWord);
		if (incoming.revealedWordTokens[String(slot.id)] !== token) continue;
		tokens[String(slot.id)] = token;
		guessedWordIds.push(slot.id);
	}
	const slotIds = new Set(puzzle.wordSlots.map((slot) => slot.id));
	const clueWordIds = [...new Set(incoming.clueWordIds)]
		.filter((id) => slotIds.has(id))
		.slice(0, QUADRAT_CLUE_LIMIT);
	const guessHashes = [...new Set(incoming.guessHashes)];
	const sanitized: PuzzleProgressState = {
		...incoming,
		guessedWordIds,
		revealedWordTokens: tokens,
		hintedCells: [],
		clueWordIds,
		hintsUsed: clueWordIds.length,
		guessHashes,
		guessCount: guessHashes.length,
		bonusWordsFound: 0,
		shuffledLetters: [],
		completedAt: null,
	};

	const saved = await db.transaction(async (transaction) => {
		await transaction.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`quadrat:${userId}:${puzzle.id}`}, 0))`,
		);
		const existing = await transaction.query.quadratProgress.findFirst({
			where: and(
				eq(quadratProgress.userId, userId),
				eq(quadratProgress.puzzleId, puzzle.id),
			),
		});
		if (existing?.progressJson.completedAt) return existing.progressJson;
		const merged = mergeQuadratProgress(
			existing?.progressJson ?? null,
			sanitized,
		);
		const bonusHashes = new Set(
			await Promise.all(
				puzzle.validNormalizedGuesses.map((word) =>
					createGuessHash(puzzle.id, word),
				),
			),
		);
		const now = new Date().toISOString();
		const progress: PuzzleProgressState = {
			...merged,
			bonusWordsFound: merged.guessHashes.filter((hash) =>
				bonusHashes.has(hash),
			).length,
			completedAt:
				merged.guessedWordIds.length === puzzle.wordSlots.length
					? (existing?.progressJson.completedAt ?? now)
					: null,
			lastSyncedAt: now,
		};
		await transaction
			.insert(quadratProgress)
			.values({
				id: crypto.randomUUID(),
				userId,
				puzzleId: puzzle.id,
				progressJson: progress,
			})
			.onConflictDoUpdate({
				target: [quadratProgress.userId, quadratProgress.puzzleId],
				set: { progressJson: progress },
			});
		return progress;
	});
	recordSyncedProgressUsage({
		game: "quadrat",
		dateKey: row.dateKey,
		userId,
		progress: saved,
	});
	return saved;
}

// Guests can read any clue of a playable board, as in the classic game.
// Accounts only read clues they asked for or words they found.
export async function getQuadratCluesData(options: {
	puzzleId: string;
	wordIds: number[];
	userId: string | null;
}): Promise<Record<number, string>> {
	if (options.wordIds.length === 0) return {};
	const row = await db.query.quadratPuzzles.findFirst({
		where: eq(quadratPuzzles.id, options.puzzleId),
		columns: { dateKey: true, publicSnapshotJson: true },
	});
	if (!row || row.dateKey > getTodayDateKey()) return {};

	const validIds = new Set(
		row.publicSnapshotJson.wordSlots.map(({ id }) => id),
	);
	let allowedIds = options.wordIds.filter((id) => validIds.has(id));
	if (options.userId) {
		const progress = await getQuadratProgress(options.userId, options.puzzleId);
		const authorized = new Set([
			...(progress?.clueWordIds ?? []),
			...(progress?.guessedWordIds ?? []),
		]);
		allowedIds = allowedIds.filter((id) => authorized.has(id));
	}
	if (allowedIds.length === 0) return {};

	const rows = await db
		.select({ wordId: quadratWordClues.wordId, clue: quadratWordClues.clue })
		.from(quadratWordClues)
		.where(
			and(
				eq(quadratWordClues.puzzleId, options.puzzleId),
				inArray(quadratWordClues.wordId, allowedIds),
			),
		);
	return Object.fromEntries(rows.map(({ wordId, clue }) => [wordId, clue]));
}
