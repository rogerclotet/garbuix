import {
	getNextPregenerationAt,
	getTodayDateKey,
	getTomorrowDateKey,
} from "@/lib/puzzle-dates";
import {
	ensureDailyPuzzleSnapshot,
	triggerDailyPuzzleGeneration,
} from "@/lib/puzzle-service.server";

export default function puzzleSchedulerPlugin() {
	const today = getTodayDateKey();

	// On server startup, ensure today's puzzle exists. Uses the shared
	// in-progress cache so a concurrent first-client request won't double-generate.
	triggerDailyPuzzleGeneration(today);

	// Pre-generate tomorrow's puzzle one hour before the Madrid rollover.
	function scheduleNextPregeneration() {
		const nextPregenerationAt = getNextPregenerationAt();
		const delay = Math.max(0, nextPregenerationAt.getTime() - Date.now());

		setTimeout(() => {
			const dateKey = getTomorrowDateKey();

			ensureDailyPuzzleSnapshot(dateKey)
				.then(() => {
					console.log(
						`[puzzle-scheduler] Pre-generated puzzle for ${dateKey}`,
					);
				})
				.catch((err: unknown) => {
					console.error(
						`[puzzle-scheduler] Pre-generation failed for ${dateKey}:`,
						err,
					);
				});

			scheduleNextPregeneration();
		}, delay);
	}

	scheduleNextPregeneration();
}
