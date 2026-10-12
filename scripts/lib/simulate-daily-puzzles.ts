import type { Word } from "@/data/types";
import {
	generateDailyCrosswordForSeed,
	HISTORY_LOOKBACK_DAYS,
	normalizeWord,
	toDailyPuzzleHistoryEntry,
} from "@/lib/crossword-generator";
import { addDaysToDateKey, dateKeyToSeed } from "@/lib/puzzle-dates";

type GeneratedDailyPuzzle = NonNullable<
	ReturnType<typeof generateDailyCrosswordForSeed>
>;

/**
 * Generates consecutive days, each against the days generated before it, the
 * way production generates against its stored puzzles.
 */
export function* simulateDailyPuzzles(
	words: Word[],
	from: string,
	days: number,
): Generator<{ dateKey: string; generated: GeneratedDailyPuzzle }> {
	// Most recent first, so a puzzle's index is one less than its age in days.
	const previousPuzzles: { letters: string[]; wordKeys: string[] }[] = [];

	for (let offset = 0; offset < days; offset++) {
		const dateKey = addDaysToDateKey(from, offset);
		const generated = generateDailyCrosswordForSeed(
			words,
			dateKeyToSeed(dateKey),
			10,
			15,
			{
				recentHistory: previousPuzzles.map((puzzle, index) =>
					toDailyPuzzleHistoryEntry(index + 1, puzzle.letters, puzzle.wordKeys),
				),
			},
		);

		if (!generated) {
			throw new Error(`Failed to generate puzzle for ${dateKey}`);
		}

		previousPuzzles.unshift({
			letters: generated.letters,
			wordKeys: generated.crossword.words.map((placement) =>
				normalizeWord(placement.word.name),
			),
		});
		previousPuzzles.length = Math.min(
			previousPuzzles.length,
			HISTORY_LOOKBACK_DAYS,
		);

		yield { dateKey, generated };
	}
}
