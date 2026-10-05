import { and, desc, eq, sql } from "drizzle-orm";
import { syllableProgress, syllablePuzzles } from "@/db/schema";
import { db } from "@/lib/db";
import { createGuessHash, createUnlockToken } from "@/lib/puzzle-crypto";
import {
	dateKeyToSeed,
	getTodayDateKey,
	isPlayableDateKey,
} from "@/lib/puzzle-dates";
import { buildHistoryEntry } from "@/lib/puzzle-helpers";
import { buildPuzzleSnapshots } from "@/lib/puzzle-snapshot";
import type { PuzzleProgressState } from "@/lib/puzzle-types";
import { getSyllableDictionary } from "@/lib/syllable-dictionary.server";
import {
	generateSyllableCrossword,
	getSyllableCells,
	SYLLABLE_ALGORITHM_VERSION,
} from "@/lib/syllable-generator";
import { mergeSyllableProgress } from "@/lib/syllable-progress";

export async function ensureSyllablePuzzle(dateKey = getTodayDateKey()) {
	if (!isPlayableDateKey(dateKey)) throw new Error("Invalid puzzle date");
	const existing = await db.query.syllablePuzzles.findFirst({
		where: eq(syllablePuzzles.dateKey, dateKey),
	});
	if (existing) return existing;
	const { crossword, letters, shuffledLetters } =
		generateSyllableCrossword(dateKey);
	const id = `syllable:${dateKey}`;
	const { publicSnapshot, privateSnapshot } = await buildPuzzleSnapshots({
		crossword,
		letters,
		initialShuffledLetters: shuffledLetters,
		dateKey,
		seed: dateKeyToSeed(dateKey),
		puzzleId: id,
		algorithmVersion: SYLLABLE_ALGORITHM_VERSION,
		availableWordCount: 5,
		getCells: getSyllableCells,
	});
	await db
		.insert(syllablePuzzles)
		.values({
			id,
			dateKey,
			publicSnapshotJson: {
				...publicSnapshot,
				...getSyllableDictionary(letters),
				difficulty: null,
			},
			privateSnapshotJson: privateSnapshot,
		})
		.onConflictDoNothing();
	// Read the winner of a concurrent generation, including its capsule salts.
	const saved = await db.query.syllablePuzzles.findFirst({
		where: eq(syllablePuzzles.dateKey, dateKey),
	});
	if (!saved) throw new Error("Syllable puzzle was not saved");
	return saved;
}

export async function getSyllableProgress(userId: string, puzzleId: string) {
	const row = await db.query.syllableProgress.findFirst({
		where: and(
			eq(syllableProgress.userId, userId),
			eq(syllableProgress.puzzleId, puzzleId),
		),
	});
	return row?.progressJson ?? null;
}

export async function getSyllableHistory(userId: string) {
	const rows = await db
		.select({
			puzzle: syllablePuzzles.publicSnapshotJson,
			progress: syllableProgress.progressJson,
		})
		.from(syllableProgress)
		.innerJoin(
			syllablePuzzles,
			eq(syllableProgress.puzzleId, syllablePuzzles.id),
		)
		.where(eq(syllableProgress.userId, userId))
		.orderBy(desc(syllablePuzzles.dateKey));
	return rows.map(({ puzzle, progress }) => ({
		...buildHistoryEntry(puzzle, progress),
		lastUpdated: progress.lastSyncedAt ?? new Date().toISOString(),
	}));
}

export async function saveSyllableProgress(
	userId: string,
	incoming: PuzzleProgressState,
) {
	const row = await db.query.syllablePuzzles.findFirst({
		where: eq(syllablePuzzles.id, incoming.puzzleId),
	});
	if (!row || row.dateKey > getTodayDateKey())
		throw new Error("Syllable puzzle not found");
	const puzzle = row.publicSnapshotJson;
	// Validate claims at the storage boundary, using the persisted answers.
	const tokens: Record<string, string> = {};
	const guessedWordIds: number[] = [];
	for (const slot of puzzle.wordSlots) {
		const answer = row.privateSnapshotJson.wordSlots.find(
			(word) => word.id === slot.id,
		);
		if (!answer || !incoming.guessedWordIds.includes(slot.id)) continue;
		const token = await createUnlockToken(slot.slotSalt, answer.normalizedWord);
		if (incoming.revealedWordTokens[String(slot.id)] !== token) continue;
		tokens[String(slot.id)] = token;
		guessedWordIds.push(slot.id);
	}
	const hintedCells = [...new Set(incoming.hintedCells)].filter((key) =>
		puzzle.hintCapsules.some((capsule) => capsule.cellKey === key),
	);
	const validLetters =
		[...incoming.shuffledLetters].sort().join("|") ===
		[...puzzle.letters].sort().join("|");
	const sanitized: PuzzleProgressState = {
		...incoming,
		guessedWordIds,
		revealedWordTokens: tokens,
		hintedCells,
		hintsUsed: hintedCells.length,
		clueWordIds: [],
		guessHashes: [...new Set(incoming.guessHashes)],
		guessCount: new Set(incoming.guessHashes).size,
		bonusWordsFound: 0,
		shuffledLetters: validLetters
			? incoming.shuffledLetters
			: puzzle.initialShuffledLetters,
		completedAt: null,
	};
	const saved = await db.transaction(async (transaction) => {
		await transaction.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`syllable:${userId}:${puzzle.id}`}, 0))`,
		);
		const existing = await transaction.query.syllableProgress.findFirst({
			where: and(
				eq(syllableProgress.userId, userId),
				eq(syllableProgress.puzzleId, puzzle.id),
			),
		});
		if (existing?.progressJson.completedAt) return existing.progressJson;
		const merged = mergeSyllableProgress(
			existing?.progressJson ?? null,
			sanitized,
		);
		const targetWords = new Set(
			row.privateSnapshotJson.wordSlots.map((word) => word.normalizedWord),
		);
		const bonusHashes = await Promise.all(
			puzzle.validNormalizedGuesses
				.filter((word) => !targetWords.has(word))
				.map((word) => createGuessHash(puzzle.id, word)),
		);
		const now = new Date().toISOString();
		const progress = {
			...merged,
			bonusWordsFound: bonusHashes.filter((hash) =>
				merged.guessHashes.includes(hash),
			).length,
			completedAt:
				merged.guessedWordIds.length === puzzle.wordSlots.length
					? (existing?.progressJson.completedAt ?? now)
					: null,
			lastSyncedAt: now,
		};
		await transaction
			.insert(syllableProgress)
			.values({
				id: crypto.randomUUID(),
				userId,
				puzzleId: puzzle.id,
				progressJson: progress,
			})
			.onConflictDoUpdate({
				target: [syllableProgress.userId, syllableProgress.puzzleId],
				set: { progressJson: progress },
			});
		return progress;
	});
	return saved;
}
