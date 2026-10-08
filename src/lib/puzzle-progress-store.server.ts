import { and, eq, sql } from "drizzle-orm";
import { userPuzzleProgress } from "@/db/schema";
import { db } from "@/lib/db";
import type { PuzzleProgressState } from "@/lib/puzzle-types";

type ProgressTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function withPuzzleProgressTransaction<T>(
	identity: { userId: string; puzzleId: string },
	action: (transaction: ProgressTransaction) => Promise<T>,
): Promise<T> {
	return db.transaction(async (transaction) => {
		// Lock before reading or deduplicating, including when no progress row
		// exists yet. Sync and guest import share this lock across app instances.
		// Hash collisions only serialize unrelated puzzles; they cannot lose data.
		await transaction.execute(sql`
			select pg_advisory_xact_lock(hashtext(${identity.userId}), hashtext(${identity.puzzleId}))
		`);
		return action(transaction);
	});
}

function serializeProgressRow(
	row: Omit<typeof userPuzzleProgress.$inferSelect, "peerClueWordIds">,
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

export async function getUserPuzzleProgressData(
	puzzleId: string,
	userId: string,
	database: Pick<typeof db, "query"> = db,
) {
	const row = await database.query.userPuzzleProgress.findFirst({
		where: and(
			eq(userPuzzleProgress.puzzleId, puzzleId),
			eq(userPuzzleProgress.userId, userId),
		),
	});

	return row ? serializeProgressRow(row) : null;
}

// Both event sync and guest import must persist every progress field. Peer
// clues are left out so a sync never clobbers a delivery recorded meanwhile.
function toStoredProgress(
	progress: PuzzleProgressState,
): Omit<
	typeof userPuzzleProgress.$inferSelect,
	"id" | "userId" | "puzzleId" | "peerClueWordIds"
> {
	return {
		guessHashes: progress.guessHashes,
		guessedWordIds: progress.guessedWordIds,
		revealedWordTokens: progress.revealedWordTokens,
		hintedCells: progress.hintedCells,
		clueWordIds: progress.clueWordIds,
		hintsUsed: progress.hintsUsed,
		guessCount: progress.guessCount,
		bonusWordsFound: progress.bonusWordsFound,
		shuffledLetters: progress.shuffledLetters,
		completedAt: progress.completedAt ? new Date(progress.completedAt) : null,
		lastSyncedAt: new Date(),
	};
}

export async function saveUserPuzzleProgress(
	userId: string,
	progress: PuzzleProgressState,
	database: ProgressTransaction,
) {
	const fields = toStoredProgress(progress);
	const row = {
		id: `${userId}:${progress.puzzleId}`,
		userId,
		puzzleId: progress.puzzleId,
		...fields,
	};
	await database.insert(userPuzzleProgress).values(row).onConflictDoUpdate({
		target: userPuzzleProgress.id,
		set: fields,
	});
	return serializeProgressRow(row);
}

// A set union per word, matching the inbox (one entry per word however many
// friends answer). Computed in SQL so concurrent deliveries for different
// words can't overwrite each other. A no-op when the player has no progress
// row, which also covers guest requester ids.
export async function addPeerClueWordIds(
	input: { userId: string; puzzleId: string; wordIds: number[] },
	database: Pick<typeof db, "update"> = db,
) {
	if (input.wordIds.length === 0) return;
	const incoming = JSON.stringify(input.wordIds);
	await database
		.update(userPuzzleProgress)
		.set({
			peerClueWordIds: sql`(
				select coalesce(jsonb_agg(distinct word_id order by word_id), '[]'::jsonb)
				from jsonb_array_elements(${userPuzzleProgress.peerClueWordIds} || ${incoming}::jsonb) as word_id
			)`,
		})
		.where(
			and(
				eq(userPuzzleProgress.userId, input.userId),
				eq(userPuzzleProgress.puzzleId, input.puzzleId),
				sql`not ${userPuzzleProgress.peerClueWordIds} @> ${incoming}::jsonb`,
			),
		);
}

export async function getPeerClueWordIds(
	userId: string,
	puzzleId: string,
): Promise<number[]> {
	const rows = await db
		.select({ peerClueWordIds: userPuzzleProgress.peerClueWordIds })
		.from(userPuzzleProgress)
		.where(
			and(
				eq(userPuzzleProgress.userId, userId),
				eq(userPuzzleProgress.puzzleId, puzzleId),
			),
		)
		.limit(1);
	return rows[0]?.peerClueWordIds ?? [];
}
