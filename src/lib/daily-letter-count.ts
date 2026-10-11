export const REGULAR_LETTER_COUNT = 6;
export const FESTIVE_LETTER_COUNT = 7;

// The first day the seven-letter rule applies. Earlier Sundays and holidays
// keep six: generating a day replays its lookback window, and that replay has
// to reproduce the puzzles that were actually published.
export const SEVEN_LETTER_DAYS_START = "2026-10-18";

// Holidays in Catalunya that fall on the same date every year, the Spanish
// ones included, as month-day. Easter and other holidays that move are left
// out so the list never needs a yearly update.
const FIXED_HOLIDAYS: ReadonlySet<string> = new Set([
	"01-01", // Cap d'Any
	"01-06", // Reis
	"05-01", // Festa del Treball
	"06-24", // Sant Joan
	"08-15", // L'Assumpció
	"09-11", // Diada Nacional de Catalunya
	"10-12", // Festa Nacional d'Espanya
	"11-01", // Tots Sants
	"12-06", // Dia de la Constitució
	"12-08", // La Immaculada
	"12-25", // Nadal
	"12-26", // Sant Esteve
]);

function isSunday(dateKey: string): boolean {
	return new Date(`${dateKey}T12:00:00.000Z`).getUTCDay() === 0;
}

function isFixedHoliday(dateKey: string): boolean {
	return FIXED_HOLIDAYS.has(dateKey.slice(5));
}

export function getDailyLetterCount(
	dateKey: string,
	sevenLetterDaysStart: string = SEVEN_LETTER_DAYS_START,
): number {
	if (dateKey < sevenLetterDaysStart) {
		return REGULAR_LETTER_COUNT;
	}

	return isSunday(dateKey) || isFixedHoliday(dateKey)
		? FESTIVE_LETTER_COUNT
		: REGULAR_LETTER_COUNT;
}
