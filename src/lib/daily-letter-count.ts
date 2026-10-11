export const REGULAR_LETTER_COUNT = 6;
export const SUNDAY_LETTER_COUNT = 7;

// The first Sunday with seven letters. Earlier Sundays keep six: generating a
// day replays its lookback window, and that replay has to reproduce the
// puzzles that were actually published.
export const SEVEN_LETTER_SUNDAYS_START = "2026-10-18";

function isSunday(dateKey: string): boolean {
	return new Date(`${dateKey}T12:00:00.000Z`).getUTCDay() === 0;
}

export function getDailyLetterCount(
	dateKey: string,
	sevenLetterSundaysStart: string = SEVEN_LETTER_SUNDAYS_START,
): number {
	return dateKey >= sevenLetterSundaysStart && isSunday(dateKey)
		? SUNDAY_LETTER_COUNT
		: REGULAR_LETTER_COUNT;
}
