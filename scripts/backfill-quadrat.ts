import { sql } from "@/lib/db";
import {
	addDaysToDateKey,
	getTodayDateKey,
	isValidDateKey,
} from "@/lib/puzzle-dates";
import {
	generateQuadratClues,
	pregenerateQuadratPuzzle,
} from "@/lib/quadrat.server";
import { runMonitoredJob } from "./lib/run-monitored-job";

function getArg(flag: string): string | undefined {
	const index = process.argv.indexOf(flag);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

function readDateArg(flag: string, fallback: string): string {
	const value = getArg(flag) ?? fallback;
	if (!isValidDateKey(value)) {
		throw new Error(`Invalid ${flag} "${value}". Expected YYYY-MM-DD.`);
	}
	return value;
}

// Creates each day's Quadrat board if missing, then its AI clues. Clues that
// already exist are kept unless --force-clues is passed. Without
// ANTHROPIC_API_KEY the boards are still created and clues are skipped.
async function main(): Promise<void> {
	const from = readDateArg("--from", getTodayDateKey());
	const to = readDateArg("--to", from);
	if (to < from) {
		throw new Error(`--to (${to}) must not be before --from (${from}).`);
	}
	const replaceExisting = process.argv.includes("--force-clues");

	for (
		let dateKey = from;
		dateKey <= to;
		dateKey = addDaysToDateKey(dateKey, 1)
	) {
		const row = await pregenerateQuadratPuzzle(dateKey);
		console.log(`[quadrat-backfill] ${dateKey}: board ${row.id}`);
		await generateQuadratClues(row, { replaceExisting });
		console.log(`[quadrat-backfill] ${dateKey}: clues done`);
	}
}

process.exitCode = await runMonitoredJob({
	run: main,
	cleanup: () => sql.end(),
});
