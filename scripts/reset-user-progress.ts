import { and, eq, inArray, sql } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import {
	dailyPuzzles,
	legacyImportedResults,
	userPuzzleEvents,
	userPuzzleProgress,
} from "@/db/schema";
import { db, sql as postgresClient } from "@/lib/db";

function getArg(flag: string): string | undefined {
	const index = process.argv.indexOf(flag);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(flag: string): boolean {
	return process.argv.includes(flag);
}

function printUsage(): void {
	console.log(
		[
			"Reset a single user's puzzle progression (progress + synced events).",
			"",
			"Usage:",
			"  pnpm reset:user-progress -- --email you@example.com [--date YYYY-MM-DD] [--include-legacy] [--confirm]",
			"",
			"Flags:",
			"  --email           Required. The account email to reset.",
			"  --date            Optional. Restrict to a single puzzle day (YYYY-MM-DD).",
			"                    Omit to reset every puzzle for the user.",
			"  --include-legacy  Also delete imported legacy history rows.",
			"  --confirm         Actually delete. Without this flag the script is a dry run.",
			"  --help            Show this message.",
		].join("\n"),
	);
}

function assertValidEmail(email: string | undefined): string {
	if (!email) {
		throw new Error("Missing required --email flag");
	}
	return email.trim().toLowerCase();
}

function assertValidDateKey(dateKey: string | undefined): string | undefined {
	if (dateKey === undefined) {
		return undefined;
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
		throw new Error(`Invalid date key "${dateKey}". Expected YYYY-MM-DD.`);
	}
	return dateKey;
}

async function countRows(
	table:
		| typeof userPuzzleProgress
		| typeof userPuzzleEvents
		| typeof legacyImportedResults,
	whereClause: ReturnType<typeof and>,
): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)` })
		.from(table)
		.where(whereClause);
	return Number(row?.count ?? 0);
}

async function main(): Promise<void> {
	if (hasFlag("--help")) {
		printUsage();
		return;
	}

	const email = assertValidEmail(getArg("--email"));
	const dateKey = assertValidDateKey(getArg("--date"));
	const includeLegacy = hasFlag("--include-legacy");
	const confirm = hasFlag("--confirm");

	const [account] = await db
		.select({ id: user.id, email: user.email })
		.from(user)
		.where(sql`lower(${user.email}) = ${email}`);

	if (!account) {
		throw new Error(`No user found with email "${email}".`);
	}

	// Resolve the puzzle(s) for the requested day, if scoped.
	const puzzleIds = dateKey
		? (
				await db
					.select({ id: dailyPuzzles.id })
					.from(dailyPuzzles)
					.where(eq(dailyPuzzles.dateKey, dateKey))
			).map((row) => row.id)
		: null;

	if (dateKey && (puzzleIds?.length ?? 0) === 0) {
		console.log(`User: ${account.email} (${account.id})`);
		console.log(`Date: ${dateKey}`);
		console.log("No puzzle exists for that date — nothing to reset.");
		return;
	}

	const progressWhere =
		puzzleIds == null
			? eq(userPuzzleProgress.userId, account.id)
			: and(
					eq(userPuzzleProgress.userId, account.id),
					inArray(userPuzzleProgress.puzzleId, puzzleIds),
				);
	const eventsWhere =
		puzzleIds == null
			? eq(userPuzzleEvents.userId, account.id)
			: and(
					eq(userPuzzleEvents.userId, account.id),
					inArray(userPuzzleEvents.puzzleId, puzzleIds),
				);
	const legacyWhere =
		dateKey == null
			? eq(legacyImportedResults.userId, account.id)
			: and(
					eq(legacyImportedResults.userId, account.id),
					eq(legacyImportedResults.dateKey, dateKey),
				);

	const [progressCount, eventCount, legacyCount] = await Promise.all([
		countRows(userPuzzleProgress, progressWhere),
		countRows(userPuzzleEvents, eventsWhere),
		includeLegacy ? countRows(legacyImportedResults, legacyWhere) : Promise.resolve(0),
	]);

	console.log(`User: ${account.email} (${account.id})`);
	console.log(`Scope: ${dateKey ?? "all puzzles"}`);
	console.log(`Progress rows: ${progressCount}`);
	console.log(`Event rows: ${eventCount}`);
	if (includeLegacy) {
		console.log(`Legacy imported rows: ${legacyCount}`);
	}

	if (!confirm) {
		console.log("");
		console.log("Dry run only. Re-run with --confirm to delete these rows.");
		return;
	}

	await db.transaction(async (tx) => {
		await tx.delete(userPuzzleEvents).where(eventsWhere);
		await tx.delete(userPuzzleProgress).where(progressWhere);
		if (includeLegacy) {
			await tx.delete(legacyImportedResults).where(legacyWhere);
		}
	});

	console.log("");
	console.log("Reset complete.");
	console.log(
		"Note: leaderboard standings live in Redis and are not affected. The user's",
	);
	console.log(
		"browser may still hold a local copy of progress — clear site data or use a",
	);
	console.log("private window so it doesn't re-sync the old state back.");
}

main()
	.catch((error) => {
		console.error("Failed to reset user progress:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await postgresClient.end();
	});
