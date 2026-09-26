import { and, desc, eq, sql } from "drizzle-orm";
import { buildHistoryEntry } from "@/components/daily/daily-helpers";
import { miniProgress, miniPuzzles } from "@/db/schema";
import { db } from "@/lib/db";
import {
	generateMiniCrossword,
	MINI_ALGORITHM_VERSION,
} from "@/lib/mini-generator";
import { mergeMiniProgress } from "@/lib/mini-progress";
import { createUnlockToken } from "@/lib/puzzle-crypto";
import { dateKeyToSeed, getTodayDateKey } from "@/lib/puzzle-dates";
import { buildPuzzleSnapshots } from "@/lib/puzzle-snapshot";
import type { PuzzleProgressState } from "@/lib/puzzle-types";

export async function ensureMiniPuzzle(dateKey = getTodayDateKey()) {
	const existing = await db.query.miniPuzzles.findFirst({
		where: eq(miniPuzzles.dateKey, dateKey),
	});
	if (existing) return existing;
	const { crossword, letters, shuffledLetters } =
		generateMiniCrossword(dateKey);
	const id = `mini:${dateKey}`;
	const { publicSnapshot, privateSnapshot } = await buildPuzzleSnapshots({
		crossword,
		letters,
		initialShuffledLetters: shuffledLetters,
		dateKey,
		seed: dateKeyToSeed(dateKey),
		puzzleId: id,
		algorithmVersion: MINI_ALGORITHM_VERSION,
		availableWordCount: 5,
	});
	await db
		.insert(miniPuzzles)
		.values({
			id,
			dateKey,
			publicSnapshotJson: { ...publicSnapshot, difficulty: null },
			privateSnapshotJson: privateSnapshot,
		})
		.onConflictDoNothing();
	// Read the winner of a concurrent generation, including its capsule salts.
	const saved = await db.query.miniPuzzles.findFirst({
		where: eq(miniPuzzles.dateKey, dateKey),
	});
	if (!saved) throw new Error("Mini puzzle was not saved");
	return saved;
}

export async function getMiniProgress(userId: string, puzzleId: string) {
	const row = await db.query.miniProgress.findFirst({
		where: and(
			eq(miniProgress.userId, userId),
			eq(miniProgress.puzzleId, puzzleId),
		),
	});
	return row?.progressJson ?? null;
}

export async function getMiniHistory(userId: string) {
	const rows = await db
		.select({
			puzzle: miniPuzzles.publicSnapshotJson,
			progress: miniProgress.progressJson,
		})
		.from(miniProgress)
		.innerJoin(miniPuzzles, eq(miniProgress.puzzleId, miniPuzzles.id))
		.where(eq(miniProgress.userId, userId))
		.orderBy(desc(miniPuzzles.dateKey));
	return rows.map(({ puzzle, progress }) => ({
		...buildHistoryEntry(puzzle, progress),
		lastUpdated: progress.lastSyncedAt ?? new Date().toISOString(),
	}));
}

export async function saveMiniProgress(
	userId: string,
	incoming: PuzzleProgressState,
) {
	const row = await db.query.miniPuzzles.findFirst({
		where: eq(miniPuzzles.id, incoming.puzzleId),
	});
	if (!row || row.dateKey > getTodayDateKey())
		throw new Error("Mini puzzle not found");
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
		[...incoming.shuffledLetters].sort().join("") ===
		[...puzzle.letters].sort().join("");
	const sanitized: PuzzleProgressState = {
		...incoming,
		guessedWordIds,
		revealedWordTokens: tokens,
		hintedCells,
		hintsUsed: hintedCells.length,
		clueWordIds: [],
		bonusWordsFound: 0,
		shuffledLetters: validLetters
			? incoming.shuffledLetters
			: puzzle.initialShuffledLetters,
		completedAt: null,
	};
	return db.transaction(async (transaction) => {
		await transaction.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`mini:${userId}:${puzzle.id}`}, 0))`,
		);
		const existing = await transaction.query.miniProgress.findFirst({
			where: and(
				eq(miniProgress.userId, userId),
				eq(miniProgress.puzzleId, puzzle.id),
			),
		});
		const merged = mergeMiniProgress(existing?.progressJson ?? null, sanitized);
		const now = new Date().toISOString();
		const progress = {
			...merged,
			completedAt:
				merged.guessedWordIds.length === puzzle.wordSlots.length
					? (existing?.progressJson.completedAt ?? now)
					: null,
			lastSyncedAt: now,
		};
		await transaction
			.insert(miniProgress)
			.values({
				id: crypto.randomUUID(),
				userId,
				puzzleId: puzzle.id,
				progressJson: progress,
			})
			.onConflictDoUpdate({
				target: [miniProgress.userId, miniProgress.puzzleId],
				set: { progressJson: progress },
			});
		return progress;
	});
}
