import { eq } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import { dailyPuzzles, userPuzzleProgress } from "@/db/schema";
import { db, sql } from "@/lib/db";
import {
	recordProgress,
	userParticipantId,
} from "@/lib/leaderboard.server";
import { getTodayDateKey, getYesterdayDateKey } from "@/lib/puzzle-dates";
import { getRedis, isRedisConfigured } from "@/lib/redis.server";

function getArg(flag: string) {
	const index = process.argv.indexOf(flag);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

async function backfillDay(dateKey: string): Promise<number> {
	const puzzleRow = await db.query.dailyPuzzles.findFirst({
		where: eq(dailyPuzzles.dateKey, dateKey),
	});

	if (!puzzleRow) {
		console.warn(`[backfill] no puzzle found for ${dateKey}`);
		return 0;
	}

	const totalWords = puzzleRow.privateSnapshotJson.wordSlots.length;
	const rows = await db
		.select({
			userId: userPuzzleProgress.userId,
			guessedWordIds: userPuzzleProgress.guessedWordIds,
			completedAt: userPuzzleProgress.completedAt,
			name: user.name,
			image: user.image,
		})
		.from(userPuzzleProgress)
		.innerJoin(user, eq(user.id, userPuzzleProgress.userId))
		.where(eq(userPuzzleProgress.puzzleId, puzzleRow.id));

	let recorded = 0;
	for (const row of rows) {
		const wordsFound = row.guessedWordIds.length;
		if (wordsFound === 0 && !row.completedAt) continue;

		const result = await recordProgress({
			dateKey,
			participantId: userParticipantId(row.userId),
			kind: "user",
			name: row.name,
			image: row.image ?? null,
			wordsFound,
			totalWords,
			completedAt: row.completedAt?.toISOString() ?? null,
			previousWordsFound: wordsFound,
			previousCompletedAt: row.completedAt?.toISOString() ?? null,
		});
		if (result.recorded) recorded += 1;
	}

	console.log(`[backfill] ${dateKey}: seeded ${recorded} entries`);
	return recorded;
}

async function main() {
	if (!isRedisConfigured()) {
		throw new Error("REDIS_URL is not configured; nothing to backfill into.");
	}

	const onlyDay = getArg("--date");
	const includeYesterday = process.argv.includes("--include-yesterday");

	const dateKeys = onlyDay
		? [onlyDay]
		: includeYesterday
			? [getYesterdayDateKey(), getTodayDateKey()]
			: [getTodayDateKey()];

	let total = 0;
	for (const dateKey of dateKeys) {
		total += await backfillDay(dateKey);
	}
	console.log(`[backfill] done, ${total} entries seeded across ${dateKeys.length} day(s)`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await sql.end();
		const redis = getRedis();
		if (redis) {
			await redis.quit();
		}
	});
