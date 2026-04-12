import { getNextRolloverAt, getTodayDateKey } from "@/lib/puzzle-dates";
import {
	ensureDailyPuzzleSnapshot,
	triggerDailyPuzzleGeneration,
} from "@/lib/puzzle-service.server";

export default function puzzleSchedulerPlugin() {
	const today = getTodayDateKey();

	// On server startup, ensure today's puzzle exists. Uses the shared
	// in-progress cache so a concurrent first-client request won't double-generate.
	triggerDailyPuzzleGeneration(today);

	// Schedule puzzle generation just after each Madrid midnight so the puzzle
	// is ready before the first user of the new day arrives.
	function scheduleNextMidnight() {
		const nextRollover = getNextRolloverAt();
		// Add a small buffer so the rollover has definitely occurred before we generate.
		const delay = nextRollover.getTime() - Date.now() + 2_000;

		setTimeout(() => {
			const dateKey = getTodayDateKey();

			ensureDailyPuzzleSnapshot(dateKey)
				.then(() => {
					console.log(`[puzzle-scheduler] Generated puzzle for ${dateKey}`);
				})
				.catch((err: unknown) => {
					console.error(
						`[puzzle-scheduler] Midnight generation failed for ${dateKey}:`,
						err,
					);
				});

			scheduleNextMidnight();
		}, delay);
	}

	scheduleNextMidnight();
}
