import type { Word } from "@/data/types";
import { normalizeWord } from "@/lib/puzzle-text";

// 1 = easy, 2 = medium, 3 = hard. Rarity dominates; more valid guesses add difficulty.
export type PuzzleDifficulty = 1 | 2 | 3;

export const PUZZLE_DIFFICULTY_LEVELS = 3;

export const PUZZLE_DIFFICULTY_LABELS: Record<PuzzleDifficulty, string> = {
	1: "Baixa",
	2: "Mitjana",
	3: "Alta",
};

export function formatDifficultyPhrase(difficulty: PuzzleDifficulty): string {
	return `Dificultat ${PUZZLE_DIFFICULTY_LABELS[difficulty].toLowerCase()}`;
}

// Approximate Catalan copy for UI tooltips — difficulty is a rough guide, not exact.
export const PUZZLE_DIFFICULTY_SUMMARIES: Record<PuzzleDifficulty, string> = {
	1: "Majoria de paraules molt comunes",
	2: "Paraules menys comunes o més opcions possibles",
	3: "Paraules més rares o moltes opcions possibles",
};

// Start with mean log10(corpus frequency), then subtract a small penalty for
// the number of valid guesses. Lower scores mean harder puzzles. Keep the
// original frequency-only terciles so rare puzzles remain hard regardless of
// how few guesses their letters allow (see scripts/analyze-difficulty.ts).
const EASY_MIN_MEAN_LOG_FREQUENCY = 3.59;
const MEDIUM_MIN_MEAN_LOG_FREQUENCY = 3.3;

// Viable letter sets currently allow 30-376 distinct guesses, with a median
// near 107. Each doubling above 30 subtracts 0.05, capped at 240 guesses.
// The 0.15 cap is smaller than the 0.29 gap between levels: word count alone
// cannot turn an easy puzzle into a hard one, and never makes rare words easier.
export function availableWordCountPenalty(availableWordCount: number): number {
	return Math.min(
		0.15,
		0.05 * Math.log2(Math.max(availableWordCount, 30) / 30),
	);
}

// Corpus frequencies are always >= 1 in practice, but clamp so a stray 0 can't
// produce -Infinity and poison the mean.
function safeLog10Frequency(frequency: number): number {
	return Math.log10(Math.max(frequency, 1));
}

export function meanLogFrequency(frequencies: readonly number[]): number {
	if (frequencies.length === 0) {
		return 0;
	}

	const total = frequencies.reduce(
		(sum, frequency) => sum + safeLog10Frequency(frequency),
		0,
	);
	return total / frequencies.length;
}

export function difficultyFromScore(score: number): PuzzleDifficulty {
	if (score >= EASY_MIN_MEAN_LOG_FREQUENCY) {
		return 1;
	}
	if (score >= MEDIUM_MIN_MEAN_LOG_FREQUENCY) {
		return 2;
	}
	return 3;
}

// Returns null when there are no frequencies to score (e.g. an empty puzzle or
// every word missing from the lookup), so callers can leave difficulty unset
// rather than reporting a misleading "hard".
export function computePuzzleDifficulty({
	frequencies,
	availableWordCount,
}: {
	frequencies: readonly number[];
	availableWordCount: number;
}): PuzzleDifficulty | null {
	if (frequencies.length === 0) {
		return null;
	}
	return difficultyFromScore(
		meanLogFrequency(frequencies) -
			availableWordCountPenalty(availableWordCount),
	);
}

// Maps each normalized word form to its highest corpus frequency. Built from the
// generation dictionary so stored puzzle snapshots (which keep only normalized
// words, not frequencies) can be re-scored during backfill and analysis.
export function buildWordFrequencyLookup(
	words: readonly Word[],
): Map<string, number> {
	const lookup = new Map<string, number>();
	for (const word of words) {
		const key = normalizeWord(word.name);
		const existing = lookup.get(key);
		if (existing === undefined || word.frequency > existing) {
			lookup.set(key, word.frequency);
		}
	}
	return lookup;
}

// Scores difficulty for a set of normalized words using a frequency lookup.
// Words missing from the lookup are skipped; if every word is missing the
// result is null.
export function computeDifficultyForNormalizedWords({
	normalizedWords,
	frequencyLookup,
	availableWordCount,
}: {
	normalizedWords: readonly string[];
	frequencyLookup: ReadonlyMap<string, number>;
	availableWordCount: number;
}): PuzzleDifficulty | null {
	const frequencies: number[] = [];
	for (const word of normalizedWords) {
		const frequency = frequencyLookup.get(word);
		if (frequency !== undefined) {
			frequencies.push(frequency);
		}
	}
	return computePuzzleDifficulty({ frequencies, availableWordCount });
}
