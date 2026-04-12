import {
	getNextPregenerationAt,
	getTodayDateKey,
	getTomorrowDateKey,
	isWithinPregenerationWindow,
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

	// If the server starts during the final hour before Madrid midnight,
	// pre-generate tomorrow immediately so the rollover can serve it cold-start free.
	if (isWithinPregenerationWindow()) {
		triggerDailyPuzzleGeneration(getTomorrowDateKey());
	}

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
