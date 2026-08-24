import { eq } from "drizzle-orm";
import { dailyPuzzles } from "@/db/schema";
import { generateAndStoreCluesForPuzzle } from "@/lib/clue-generator.server";
import { db, sql as postgresClient } from "@/lib/db";
import { addDaysToDateKey, getTodayDateKey } from "@/lib/puzzle-dates";

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
			"Generate and store AI word clues for already-created puzzles.",
			"Idempotent: clues that already exist are skipped. Requires ANTHROPIC_API_KEY.",
			"",
			"Usage:",
			"  pnpm clues:backfill -- --date YYYY-MM-DD",
			"  pnpm clues:backfill -- --from YYYY-MM-DD --to YYYY-MM-DD",
			"",
			"Flags:",
			"  --date   Single puzzle date key.",
			"  --from   Range start (inclusive). Defaults to today.",
			"  --to     Range end (inclusive). Defaults to --from.",
			"  --help   Show this message.",
		].join("\n"),
	);
}

function assertValidDateKey(dateKey: string, flag: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
		throw new Error(`Invalid ${flag} "${dateKey}". Expected YYYY-MM-DD.`);
	}
	return dateKey;
}

function resolveRange(): { from: string; to: string } {
	const dateArg = getArg("--date");
	if (dateArg) {
		const date = assertValidDateKey(dateArg, "--date");
		return { from: date, to: date };
	}

	const from = assertValidDateKey(
		getArg("--from") ?? getTodayDateKey(),
		"--from",
	);
	const to = assertValidDateKey(getArg("--to") ?? from, "--to");
	if (to < from) {
		throw new Error(`--to (${to}) must not be before --from (${from}).`);
	}
	return { from, to };
}

async function backfillDate(dateKey: string) {
	const rows = await db
		.select({
			id: dailyPuzzles.id,
			privateSnapshotJson: dailyPuzzles.privateSnapshotJson,
		})
		.from(dailyPuzzles)
		.where(eq(dailyPuzzles.dateKey, dateKey));

	if (rows.length === 0) {
		console.log(`${dateKey}: no puzzle row, skipping`);
		return;
	}

	for (const row of rows) {
		const wordSlots = row.privateSnapshotJson.wordSlots;
		console.log(
			`${dateKey}: generating clues for puzzle ${row.id} (${wordSlots.length} words)…`,
		);
		await generateAndStoreCluesForPuzzle({ puzzleId: row.id, wordSlots });
		console.log(`${dateKey}: done (${row.id})`);
	}
}

async function main() {
	if (hasFlag("--help")) {
		printUsage();
		return;
	}

	const { from, to } = resolveRange();
	let current = from;
	while (current <= to) {
		await backfillDate(current);
		current = addDaysToDateKey(current, 1);
	}
}

main()
	.catch((error) => {
		console.error("Failed to backfill clues:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await postgresClient.end();
	});
