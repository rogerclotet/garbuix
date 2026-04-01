import { eq, inArray, sql } from "drizzle-orm";
import {
	dailyPuzzles,
	legacyImportedResults,
	userPuzzleEvents,
	userPuzzleProgress,
} from "@/db/schema";
import { db, sql as postgresClient } from "@/lib/db";

function getArg(flag: string) {
	const index = process.argv.indexOf(flag);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(flag: string) {
	return process.argv.includes(flag);
}

function printUsage() {
	console.log(
		[
			"Delete all server-side puzzle data for a given day.",
			"",
			"Usage:",
			"  pnpm delete:puzzle-day -- --date YYYY-MM-DD [--confirm]",
			"",
			"Flags:",
			"  --date      Required. Puzzle date key in YYYY-MM-DD format.",
			"  --confirm   Actually delete data. Without this flag the script is a dry run.",
			"  --help      Show this message.",
		].join("\n"),
	);
}

function assertValidDateKey(dateKey: string | undefined): string {
	if (!dateKey) {
		throw new Error("Missing required --date flag");
	}

	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
		throw new Error(`Invalid date key "${dateKey}". Expected YYYY-MM-DD.`);
	}

	return dateKey;
}

async function main() {
	if (hasFlag("--help")) {
		printUsage();
		return;
	}

	const dateKey = assertValidDateKey(getArg("--date"));
	const confirm = hasFlag("--confirm");
	const puzzleRows = await db
		.select({
			id: dailyPuzzles.id,
			seed: dailyPuzzles.seed,
			wordCount: dailyPuzzles.wordCount,
			createdAt: dailyPuzzles.createdAt,
		})
		.from(dailyPuzzles)
		.where(eq(dailyPuzzles.dateKey, dateKey));
	const puzzleIds = puzzleRows.map((row) => row.id);

	const [legacyStats] = await db
		.select({
			count: sql<number>`count(*)`,
		})
		.from(legacyImportedResults)
		.where(eq(legacyImportedResults.dateKey, dateKey));

	const [progressStats, eventStats] = puzzleIds.length
		? await Promise.all([
				db
					.select({
						count: sql<number>`count(*)`,
					})
					.from(userPuzzleProgress)
					.where(inArray(userPuzzleProgress.puzzleId, puzzleIds)),
				db
					.select({
						count: sql<number>`count(*)`,
					})
					.from(userPuzzleEvents)
					.where(inArray(userPuzzleEvents.puzzleId, puzzleIds)),
			]).then(([progressRows, eventRows]) => [progressRows[0], eventRows[0]])
		: [{ count: 0 }, { count: 0 }];

	console.log(`Date: ${dateKey}`);
	if (puzzleRows.length === 0) {
		console.log("Puzzle row: not found");
	} else {
		for (const puzzleRow of puzzleRows) {
			console.log(
				`Puzzle row: id=${puzzleRow.id} seed=${puzzleRow.seed} words=${puzzleRow.wordCount} created_at=${puzzleRow.createdAt.toISOString()}`,
			);
		}
	}
	console.log(`Progress rows: ${progressStats.count}`);
	console.log(`Event rows: ${eventStats.count}`);
	console.log(`Legacy imported rows: ${legacyStats.count}`);

	if (!confirm) {
		console.log("");
		console.log("Dry run only. Re-run with --confirm to delete these rows.");
		return;
	}

	await db.transaction(async (tx) => {
		await tx
			.delete(legacyImportedResults)
			.where(eq(legacyImportedResults.dateKey, dateKey));

		if (puzzleRows.length > 0) {
			await tx.delete(dailyPuzzles).where(eq(dailyPuzzles.dateKey, dateKey));
		}
	});

	console.log("");
	console.log("Deletion complete.");
}

main()
	.catch((error) => {
		console.error("Failed to delete puzzle day:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await postgresClient.end();
	});
