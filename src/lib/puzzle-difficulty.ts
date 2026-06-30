import type { Word } from "@/data/types";
import { normalizeWord } from "@/lib/puzzle-text";

// 1 = easy (common words), 2 = medium, 3 = hard (rarer words).
export type PuzzleDifficulty = 1 | 2 | 3;

export const PUZZLE_DIFFICULTY_LEVELS = 3;

// Difficulty is the mean log10(corpus frequency) of the puzzle's words. The
// generator biases word selection toward common words, so a lower mean means
// the day's words are rarer and the puzzle is harder. The two thresholds are
// the empirical terciles of a 365-day simulation (see
// scripts/analyze-difficulty.ts), chosen so the long-run star distribution is
// roughly even across easy/medium/hard.
const EASY_MIN_MEAN_LOG_FREQUENCY = 3.59;
const MEDIUM_MIN_MEAN_LOG_FREQUENCY = 3.3;

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

export function difficultyFromMeanLogFrequency(
	meanLog: number,
): PuzzleDifficulty {
	if (meanLog >= EASY_MIN_MEAN_LOG_FREQUENCY) {
		return 1;
	}
	if (meanLog >= MEDIUM_MIN_MEAN_LOG_FREQUENCY) {
		return 2;
	}
	return 3;
}

// Returns null when there are no frequencies to score (e.g. an empty puzzle or
// every word missing from the lookup), so callers can leave difficulty unset
// rather than reporting a misleading "hard".
export function computePuzzleDifficulty(
	frequencies: readonly number[],
): PuzzleDifficulty | null {
	if (frequencies.length === 0) {
		return null;
	}
	return difficultyFromMeanLogFrequency(meanLogFrequency(frequencies));
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
export function computeDifficultyForNormalizedWords(
	normalizedWords: readonly string[],
	frequencyLookup: ReadonlyMap<string, number>,
): PuzzleDifficulty | null {
	const frequencies: number[] = [];
	for (const word of normalizedWords) {
		const frequency = frequencyLookup.get(word);
		if (frequency !== undefined) {
			frequencies.push(frequency);
		}
	}
	return computePuzzleDifficulty(frequencies);
}
