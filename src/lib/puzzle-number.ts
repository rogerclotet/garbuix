// Garbuix #1 is the first daily puzzle; each Madrid day after it adds one.
// Counted from a fixed date rather than from stored rows, because the backfill
// script can create puzzles for days before launch.
export const FIRST_PUZZLE_DATE_KEY = "2026-03-11";

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

function dateKeyToUtcMs(dateKey: string): number {
	return Date.parse(`${dateKey}T00:00:00.000Z`);
}

// Returns null for days before #1, which have no number to show.
export function getPuzzleNumber(dateKey: string): number | null {
	const days = Math.round(
		(dateKeyToUtcMs(dateKey) - dateKeyToUtcMs(FIRST_PUZZLE_DATE_KEY)) /
			ONE_DAY_IN_MS,
	);
	return days >= 0 ? days + 1 : null;
}

// Day/month/year without zero padding, as dates are usually written in Catalan.
export function formatShortPuzzleDate(dateKey: string): string {
	const [year, month, day] = dateKey.split("-");
	return `${Number(day)}/${Number(month)}/${year}`;
}

export function buildPuzzleHeadline(dateKey: string): string {
	const number = getPuzzleNumber(dateKey);
	const date = formatShortPuzzleDate(dateKey);
	return number === null ? `Garbuix - ${date}` : `Garbuix #${number} - ${date}`;
}
