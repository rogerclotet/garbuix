import type { HistorySummaryEntry } from "@/lib/puzzle-types";

// The first daily puzzle generated with the word rules of #189.
export const WORD_RULES_CHANGE_DATE_KEY = "2026-10-27";
// Two weeks reaches the regular players. Anyone returning later meets the new
// rules without the old ones fresh in mind, and "Sobre el joc" explains them.
export const WORD_RULES_ANNOUNCEMENT_LAST_DATE_KEY = "2026-11-09";

// Only players who played under the old rules have something to unlearn.
export function shouldAnnounceWordRules(
	puzzleDateKey: string,
	historyEntries: HistorySummaryEntry[],
): boolean {
	if (puzzleDateKey < WORD_RULES_CHANGE_DATE_KEY) return false;
	if (puzzleDateKey > WORD_RULES_ANNOUNCEMENT_LAST_DATE_KEY) return false;
	return historyEntries.some(
		(entry) =>
			entry.dateKey < WORD_RULES_CHANGE_DATE_KEY &&
			(entry.legacy === true ||
				entry.guessCount > 0 ||
				entry.hintsUsed > 0 ||
				entry.guessedWords > 0),
	);
}
