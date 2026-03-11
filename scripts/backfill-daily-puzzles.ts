import { ensureDailyPuzzleSnapshot } from "@/lib/puzzle-service.server";
import { sql } from "@/lib/db";
import { getTodayDateKey } from "@/lib/puzzle-dates";

function getArg(flag: string) {
	const index = process.argv.indexOf(flag);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

function addOneDay(dateKey: string) {
	const date = new Date(`${dateKey}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

async function main() {
	const today = getTodayDateKey();
	const from = getArg("--from") ?? (() => {
		const date = new Date(`${today}T12:00:00.000Z`);
		date.setUTCDate(date.getUTCDate() - 365);
		return date.toISOString().slice(0, 10);
	})();
	const to = getArg("--to") ?? today;

	let current = from;
	while (current <= to) {
		await ensureDailyPuzzleSnapshot(current);
		console.log(`backfilled ${current}`);
		current = addOneDay(current);
	}
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await sql.end();
	});
