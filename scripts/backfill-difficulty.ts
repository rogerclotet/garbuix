import { asc, eq } from "drizzle-orm";
import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import { dailyPuzzles } from "@/db/schema";
import { db, sql } from "@/lib/db";
import { getTodayDateKey, getYesterdayDateKey } from "@/lib/puzzle-dates";
import {
	buildWordFrequencyLookup,
	computeDifficultyForNormalizedWords,
} from "@/lib/puzzle-difficulty";

// Recompute and persist the 1-3 star difficulty for stored puzzles. Difficulty
// is derived from the puzzle's word frequencies, which the public snapshot
// doesn't keep, so we re-score the private snapshot's normalized words against
// the current generation dictionary. By default this fills in today and
// yesterday so the difficulty also shows on the previous-day history view.

const frequencyLookup = buildWordFrequencyLookup(allWords as Word[]);

function getArg(flag: string) {
	const index = process.argv.indexOf(flag);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

function addOneDay(dateKey: string) {
	const date = new Date(`${dateKey}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

function resolveDateKeys(): string[] | "all" {
	if (process.argv.includes("--all")) {
		return "all";
	}

	const onlyDate = getArg("--date");
	if (onlyDate) {
		return [onlyDate];
	}

	const from = getArg("--from");
	const to = getArg("--to");
	if (from || to) {
		const start = from ?? to ?? getTodayDateKey();
		const end = to ?? from ?? getTodayDateKey();
		const dates: string[] = [];
		let current = start;
		while (current <= end) {
			dates.push(current);
			current = addOneDay(current);
		}
		return dates;
	}

	// Default: yesterday and today.
	return [getYesterdayDateKey(), getTodayDateKey()];
}

type PuzzleRow = typeof dailyPuzzles.$inferSelect;

async function backfillRow(row: PuzzleRow): Promise<boolean> {
	const normalizedWords = row.privateSnapshotJson.wordSlots.map(
		(slot) => slot.normalizedWord,
	);
	const difficulty = computeDifficultyForNormalizedWords(
		normalizedWords,
		frequencyLookup,
	);

	if (difficulty == null) {
		console.warn(
			`[backfill-difficulty] ${row.dateKey}: no scorable words, leaving difficulty unset`,
		);
		return false;
	}

	await db
		.update(dailyPuzzles)
		.set({
			difficulty,
			// Keep the snapshot JSON in sync so clients reading it directly agree
			// with the column.
			publicSnapshotJson: { ...row.publicSnapshotJson, difficulty },
		})
		.where(eq(dailyPuzzles.id, row.id));

	console.log(
		`[backfill-difficulty] ${row.dateKey}: difficulty ${difficulty} (${"★".repeat(difficulty)}${"☆".repeat(3 - difficulty)})`,
	);
	return true;
}

async function collectRows(target: string[] | "all"): Promise<PuzzleRow[]> {
	if (target === "all") {
		return db.select().from(dailyPuzzles).orderBy(asc(dailyPuzzles.dateKey));
	}

	const rows: PuzzleRow[] = [];
	for (const dateKey of target) {
		const row = await db.query.dailyPuzzles.findFirst({
			where: eq(dailyPuzzles.dateKey, dateKey),
		});
		if (!row) {
			console.warn(`[backfill-difficulty] no puzzle found for ${dateKey}`);
			continue;
		}
		rows.push(row);
	}
	return rows;
}

async function main() {
	const rows = await collectRows(resolveDateKeys());

	let updated = 0;
	for (const row of rows) {
		if (await backfillRow(row)) {
			updated += 1;
		}
	}

	console.log(
		`[backfill-difficulty] done, updated ${updated}/${rows.length} puzzle(s)`,
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await sql.end();
	});
