import type { DailyPuzzlePublic } from "@/lib/puzzle-types";

export type SyllablePuzzlePublic = DailyPuzzlePublic & {
	// A guess must match both a dictionary word and its syllable boundaries.
	validSyllableGuesses: string[];
	displayWords: Record<string, string>;
};

export const SYLLABLE_WORD_COUNT = 5;
