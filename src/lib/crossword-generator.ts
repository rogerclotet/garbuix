// Crossword generator for Catalan word game

import type { Word } from "@/data/types";
import { dateKeyToSeed, seedToDateKey } from "@/lib/puzzle-dates";
import { normalizeWord } from "@/lib/puzzle-text";

import {
	type CrosswordGrid,
	DEFAULT_MAX_WORDS,
	DEFAULT_MIN_WORDS,
	generateCrossword,
	MIN_GRID_COLS,
} from "./crossword/grid-placement";
import { SeededRandom } from "./crossword/seeded-random";
import {
	countSameRootPairs,
	getWordRuntimeMetadata,
	type WordLike,
	type WordRuntimeMetadata,
} from "./crossword/word-metadata";

export {
	type CrosswordGrid,
	type GridCell,
	generateCrossword,
	tryGenerateCrossword,
	type WordPlacement,
} from "./crossword/grid-placement";
export { SeededRandom } from "./crossword/seeded-random";
export { countSameRootPairs, wordsShareRoot } from "./crossword/word-metadata";

const LETTER_CANDIDATE_POOL_SIZE = 256;
const LETTER_CANDIDATE_RANK_BIAS = 1.6;
const LETTER_NOVELTY_WEIGHT = 1.0;
const LETTER_HEAT_DECAY = 0.4;
const LETTER_NOVELTY_WINDOW_DAYS = 21;
const MAX_LETTER_OVERLAP_HARD = 3;
const LETTER_SET_HISTORY_WINDOW_DAYS = 28;
const WORD_HISTORY_WINDOW_DAYS = 45;
const HISTORY_LOOKBACK_DAYS = Math.max(
	LETTER_SET_HISTORY_WINDOW_DAYS,
	WORD_HISTORY_WINDOW_DAYS,
);
const EXACT_LETTER_SET_REPEAT_PENALTY = 14;
const LETTER_OVERLAP_PENALTY = 1.15;
const WORD_REPEAT_PENALTY = 1.85;
const HIGH_WORD_REPEAT_PENALTY = 0.45;
const MIN_VIABLE_ELIGIBLE_WORDS = 25;
const WORD_FRESHNESS_PENALTY = 1.5;
// Score penalty per residual same-root pair, so the chooser prefers letter sets
// that reach the target word count without morphological siblings.
const SAME_ROOT_PAIR_PENALTY = 3;

type DailyPuzzleHistorySummary = {
	letters: string[];
	letterSetKey: string;
	selectedWordKeys: string[];
};

export type DailyPuzzleHistoryEntry = DailyPuzzleHistorySummary & {
	daysAgo: number;
};

type DailyGenerationResult = {
	crossword: CrosswordGrid;
	letters: string[];
	shuffledLetters: string[];
	summary: DailyPuzzleHistorySummary;
};

export type ViableLetterSet = {
	key: string;
	letters: string[];
	eligibleCount: number;
	maxFrequency: number;
};

type CachedWordDataset = {
	words: Word[];
	entries: WordRuntimeMetadata[];
	eligibleWordsByLetterSet: Map<string, Word[]>;
	viableLetterSets: ViableLetterSet[] | null;
};

type WordLengthProfile = {
	total: number;
	fourLetter: number;
	fiveLetter: number;
	short: number;
	medium: number;
	long: number;
	sevenPlus: number;
	fourLetterRatio: number;
	fiveLetterRatio: number;
	shortRatio: number;
	mediumRatio: number;
	longRatio: number;
	sevenPlusRatio: number;
	averageLength: number;
	uniqueLengths: number;
};

const IDEAL_FOUR_LETTER_RATIO = 0.35;
const IDEAL_SHORT_WORD_RATIO = 0.55;
const STRONG_DIVERSITY_SCORE = 46;
let cachedWordDataset: CachedWordDataset | null = null;

function getCachedWordDataset(words: Word[]): CachedWordDataset {
	if (cachedWordDataset?.words === words) {
		return cachedWordDataset;
	}

	cachedWordDataset = {
		words,
		entries: words.map((word) => getWordRuntimeMetadata(word)),
		eligibleWordsByLetterSet: new Map(),
		viableLetterSets: null,
	};

	return cachedWordDataset;
}

function getWordLengthProfile(words: WordLike[]): WordLengthProfile {
	const lengths = words.map(
		(word) => getWordRuntimeMetadata(word).normalizedName.length,
	);
	const total = lengths.length;
	const fourLetter = lengths.filter((length) => length === 4).length;
	const fiveLetter = lengths.filter((length) => length === 5).length;
	const short = lengths.filter((length) => length <= 5).length;
	const medium = lengths.filter((length) => length >= 6 && length <= 8).length;
	const long = lengths.filter((length) => length >= 9).length;
	const sevenPlus = lengths.filter((length) => length >= 7).length;
	const averageLength =
		total === 0 ? 0 : lengths.reduce((sum, length) => sum + length, 0) / total;

	return {
		total,
		fourLetter,
		fiveLetter,
		short,
		medium,
		long,
		sevenPlus,
		fourLetterRatio: total === 0 ? 0 : fourLetter / total,
		fiveLetterRatio: total === 0 ? 0 : fiveLetter / total,
		shortRatio: total === 0 ? 0 : short / total,
		mediumRatio: total === 0 ? 0 : medium / total,
		longRatio: total === 0 ? 0 : long / total,
		sevenPlusRatio: total === 0 ? 0 : sevenPlus / total,
		averageLength,
		uniqueLengths: new Set(lengths).size,
	};
}

function scoreWordLengthProfile(profile: WordLengthProfile): number {
	if (profile.total === 0) {
		return Number.NEGATIVE_INFINITY;
	}

	const fourLetterPenalty =
		Math.max(0, profile.fourLetterRatio - IDEAL_FOUR_LETTER_RATIO) * 38;
	const shortPenalty =
		Math.max(0, profile.shortRatio - IDEAL_SHORT_WORD_RATIO) * 18;

	return (
		profile.averageLength * 4.5 +
		profile.mediumRatio * 13 +
		profile.sevenPlusRatio * 8 +
		profile.longRatio * 18 +
		Math.min(profile.uniqueLengths, 5) * 2 -
		fourLetterPenalty -
		shortPenalty
	);
}

function addDaysToDateKey(dateKey: string, days: number): string {
	const date = new Date(`${dateKey}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function buildLetterSetKey(letters: string[]): string {
	return [...letters].sort().join("");
}

function getRecencyWeight(daysAgo: number, windowDays: number): number {
	if (daysAgo <= 0 || daysAgo > windowDays) {
		return 0;
	}

	return (windowDays - daysAgo + 1) / windowDays;
}

function countIntersection(left: Iterable<string>, right: Set<string>): number {
	let count = 0;
	for (const value of left) {
		if (right.has(value)) {
			count++;
		}
	}
	return count;
}

function summarizeDailyGeneration(
	letters: string[],
	crossword: CrosswordGrid,
): DailyPuzzleHistorySummary {
	return {
		letters,
		letterSetKey: buildLetterSetKey(letters),
		selectedWordKeys: crossword.words.map((placement) =>
			normalizeWord(placement.word.name),
		),
	};
}

export function calculateCandidateFreshnessPenalty(
	letters: string[],
	selectedWordNames: string[],
	recentHistory: DailyPuzzleHistoryEntry[],
): number {
	const letterSetKey = buildLetterSetKey(letters);
	const letterSet = new Set(letters);
	const selectedWordKeys = selectedWordNames.map((word) => normalizeWord(word));
	const perWordRepeatWeight = new Map<string, number>();
	let penalty = 0;

	for (const historyEntry of recentHistory) {
		const letterWeight = getRecencyWeight(
			historyEntry.daysAgo,
			LETTER_SET_HISTORY_WINDOW_DAYS,
		);

		if (letterWeight > 0) {
			if (historyEntry.letterSetKey === letterSetKey) {
				penalty += EXACT_LETTER_SET_REPEAT_PENALTY * letterWeight;
			}

			const overlapCount = countIntersection(historyEntry.letters, letterSet);
			penalty +=
				Math.max(0, overlapCount - 2) * LETTER_OVERLAP_PENALTY * letterWeight;
		}

		const wordWeight = getRecencyWeight(
			historyEntry.daysAgo,
			WORD_HISTORY_WINDOW_DAYS,
		);
		if (wordWeight === 0) {
			continue;
		}

		const historicalWords = new Set(historyEntry.selectedWordKeys);
		for (const wordKey of selectedWordKeys) {
			if (!historicalWords.has(wordKey)) {
				continue;
			}

			penalty += WORD_REPEAT_PENALTY * wordWeight;
			perWordRepeatWeight.set(
				wordKey,
				(perWordRepeatWeight.get(wordKey) ?? 0) + wordWeight,
			);
		}
	}

	for (const repeatWeight of perWordRepeatWeight.values()) {
		if (repeatWeight > 1.5) {
			penalty += (repeatWeight - 1.5) * HIGH_WORD_REPEAT_PENALTY;
		}
	}

	return penalty;
}

function createRankBiasedIndex(length: number, random: SeededRandom): number {
	if (length <= 1) {
		return 0;
	}

	return Math.min(
		length - 1,
		Math.floor(random.next() ** LETTER_CANDIDATE_RANK_BIAS * length),
	);
}

export { normalizeWord };

/**
 * Check if two words match when normalized (without accents)
 */
export function wordsMatch(word1: string, word2: string): boolean {
	return normalizeWord(word1) === normalizeWord(word2);
}

/**
 * Filter words that can be formed using only the given set of letters
 * (letters can be repeated, accents are ignored)
 */
export function filterWordsByLetters(
	words: Word[],
	allowedLetters: string[],
): Word[] {
	const dataset = getCachedWordDataset(words);
	const normalizedAllowed = [
		...new Set(allowedLetters.map((l) => normalizeWord(l))),
	];
	const letterSetKey = [...normalizedAllowed].sort().join("");
	const cachedEligibleWords =
		dataset.eligibleWordsByLetterSet.get(letterSetKey);
	if (cachedEligibleWords) {
		return cachedEligibleWords;
	}

	const allowedSet = new Set(normalizedAllowed);

	return dataset.entries
		.filter((entry) => {
			if (entry.cellCount < 4) {
				return false;
			}

			for (const char of entry.uniqueLetters) {
				if (!allowedSet.has(char)) {
					return false;
				}
			}

			return true;
		})
		.map((entry) => entry.word as Word);
}

/**
 * Precompute all viable 6-letter sets from the dictionary.
 * Groups words by their unique letter sets and filters to sets that produce
 * enough eligible words for a crossword puzzle. Results are cached by
 * reference equality on the words array.
 */
export function computeViableLetterSets(words: Word[]): ViableLetterSet[] {
	const dataset = getCachedWordDataset(words);
	if (dataset.viableLetterSets) {
		return dataset.viableLetterSets;
	}

	// Find all words with exactly 6 unique letters (length 6-10) and group by letter set
	const groups = new Map<string, { letters: string[]; maxFrequency: number }>();
	for (let index = 0; index < dataset.entries.length; index++) {
		const entry = dataset.entries[index];
		if (
			entry.uniqueLetters.length !== 6 ||
			entry.normalizedName.length < 6 ||
			entry.normalizedName.length > 10
		) {
			continue;
		}
		const key = entry.uniqueLetterKey;
		const existing = groups.get(key);
		if (existing) {
			existing.maxFrequency = Math.max(
				existing.maxFrequency,
				words[index].frequency,
			);
		} else {
			groups.set(key, {
				letters: entry.uniqueLetters,
				maxFrequency: words[index].frequency,
			});
		}
	}

	// Filter to sets that produce enough eligible words
	const result: ViableLetterSet[] = [];
	for (const [key, group] of groups) {
		const normalizedAllowed = new Set(group.letters);
		const eligibleWords: Word[] = [];
		for (let index = 0; index < dataset.entries.length; index++) {
			const entry = dataset.entries[index];
			if (entry.cellCount < 4) {
				continue;
			}

			let valid = true;
			for (const char of entry.uniqueLetters) {
				if (!normalizedAllowed.has(char)) {
					valid = false;
					break;
				}
			}
			if (valid) {
				eligibleWords.push(words[index]);
			}
		}

		if (eligibleWords.length >= MIN_VIABLE_ELIGIBLE_WORDS) {
			dataset.eligibleWordsByLetterSet.set(key, eligibleWords);
			result.push({
				key,
				letters: group.letters,
				eligibleCount: eligibleWords.length,
				maxFrequency: group.maxFrequency,
			});
		}
	}

	dataset.viableLetterSets = result;
	return result;
}

function computeLetterHeat(
	recentHistory: DailyPuzzleHistoryEntry[],
): Map<string, number> {
	const heat = new Map<string, number>();
	for (const entry of recentHistory) {
		const weight = getRecencyWeight(
			entry.daysAgo,
			LETTER_SET_HISTORY_WINDOW_DAYS,
		);
		if (weight <= 0) continue;
		for (const letter of entry.letters) {
			heat.set(letter, (heat.get(letter) ?? 0) + weight);
		}
	}
	return heat;
}

/**
 * Pick 6 letters that produce a good amount of words, with novelty scoring
 * to avoid repeating the same letter sets across consecutive days.
 * Letters are derived from viable letter sets (groups of 6 unique letters
 * found in actual dictionary words), scored by frequency, eligible word
 * count, and novelty relative to recent history.
 */
export function getRandomLetterSet(
	words: Word[],
	random: SeededRandom = new SeededRandom(Date.now()),
	options: {
		recentHistory?: DailyPuzzleHistoryEntry[];
		viableLetterSets?: ViableLetterSet[];
	} = {},
): string[] {
	const { recentHistory = [], viableLetterSets } = options;
	const viable = viableLetterSets ?? computeViableLetterSets(words);

	if (viable.length === 0) {
		return random.shuffleArray("aeioustrln".split("")).slice(0, 6);
	}

	const letterHeat = computeLetterHeat(recentHistory);

	// Recent letter sets for hard overlap check
	const recentLetterSets = recentHistory
		.filter((e) => e.daysAgo <= LETTER_NOVELTY_WINDOW_DAYS)
		.map((e) => new Set(e.letters));

	// Score each viable letter set by frequency, eligible word count, and novelty
	const scored = viable.map((ls) => {
		const freqScore = Math.log10(ls.maxFrequency + 10);
		const eligibleBonus = Math.log10(ls.eligibleCount + 1) * 0.3;

		// Novelty: prefer letters that haven't been used recently
		const novelty = ls.letters.reduce(
			(sum, l) =>
				sum + Math.max(0, 1 - (letterHeat.get(l) ?? 0) * LETTER_HEAT_DECAY),
			0,
		);

		// Hard overlap penalty for sets too similar to recent ones
		const maxOverlap =
			recentLetterSets.length > 0
				? Math.max(
						...recentLetterSets.map((recent) =>
							countIntersection(ls.letters, recent),
						),
					)
				: 0;
		const overlapPenalty =
			maxOverlap > MAX_LETTER_OVERLAP_HARD
				? (maxOverlap - MAX_LETTER_OVERLAP_HARD) * 4
				: 0;

		return {
			ls,
			score:
				freqScore * 0.4 +
				eligibleBonus +
				novelty * LETTER_NOVELTY_WEIGHT +
				random.next() * 0.6 -
				overlapPenalty,
		};
	});

	scored.sort((a, b) => b.score - a.score);

	const pool = scored.slice(
		0,
		Math.min(scored.length, LETTER_CANDIDATE_POOL_SIZE),
	);
	const selected = pool[createRankBiasedIndex(pool.length, random)];

	return random.shuffleArray([...selected.ls.letters]);
}

export function generateDailyCrosswordForSeed(
	words: Word[],
	seed: number,
	minWords = DEFAULT_MIN_WORDS,
	maxWords = DEFAULT_MAX_WORDS,
	options: {
		cache?: Map<number, DailyGenerationResult | null>;
	} = {},
): {
	crossword: CrosswordGrid;
	letters: string[];
	shuffledLetters: string[];
} | null {
	return generateDailyCrosswordForSeedInternal(
		words,
		seed,
		minWords,
		maxWords,
		options.cache ?? new Map(),
	);
}

function generateDailyCrosswordForSeedInternal(
	words: Word[],
	seed: number,
	minWords = DEFAULT_MIN_WORDS,
	maxWords = DEFAULT_MAX_WORDS,
	cache: Map<number, DailyGenerationResult | null> = new Map(),
): DailyGenerationResult | null {
	const cached = cache.get(seed);
	if (cached !== undefined) {
		return cached;
	}

	// Generate all days in the lookback window iteratively (oldest first)
	// so each day benefits from cached history of earlier days.
	// This avoids deep recursion and ensures the freshness system
	// builds on actual generated puzzles rather than baselines.
	const dateKey = seedToDateKey(seed);
	const startDate = addDaysToDateKey(dateKey, -HISTORY_LOOKBACK_DAYS);
	let currentDate = startDate;

	while (currentDate <= dateKey) {
		const currentSeed = dateKeyToSeed(currentDate);
		if (!cache.has(currentSeed)) {
			const recentHistory = buildHistoryFromCache(currentSeed, cache);
			const generated = selectBestDailyCrosswordForSeed(
				words,
				currentSeed,
				minWords,
				maxWords,
				recentHistory,
			);
			cache.set(currentSeed, generated);
		}
		currentDate = addDaysToDateKey(currentDate, 1);
	}

	return cache.get(seed) ?? null;
}

/**
 * Compute per-word penalties based on recent puzzle history.
 * Words that appeared in recent puzzles receive a negative score
 * adjustment so the crossword generator prefers fresh words.
 */
function computeWordFreshnessPenalties(
	recentHistory: DailyPuzzleHistoryEntry[],
): Map<string, number> {
	const penalties = new Map<string, number>();

	for (const entry of recentHistory) {
		const weight = getRecencyWeight(entry.daysAgo, WORD_HISTORY_WINDOW_DAYS);
		if (weight <= 0) continue;

		for (const wordKey of entry.selectedWordKeys) {
			const current = penalties.get(wordKey) ?? 0;
			penalties.set(wordKey, current - weight * WORD_FRESHNESS_PENALTY);
		}
	}

	return penalties;
}

function selectBestDailyCrosswordForSeed(
	words: Word[],
	seed: number,
	minWords = DEFAULT_MIN_WORDS,
	maxWords = DEFAULT_MAX_WORDS,
	recentHistory: DailyPuzzleHistoryEntry[] = [],
): DailyGenerationResult | null {
	const requiredMinWords = Math.max(minWords, DEFAULT_MIN_WORDS);
	const safeMaxWords = Math.max(maxWords, requiredMinWords);
	const random = new SeededRandom(seed);
	const viableLetterSets = computeViableLetterSets(words);

	// Build word freshness penalties from recent history so the crossword
	// generator deprioritizes words that appeared in recent puzzles.
	const wordPenalties = computeWordFreshnessPenalties(recentHistory);

	let bestLetters: string[] = [];
	let bestCrossword: CrosswordGrid | null = null;
	let bestScore = Number.NEGATIVE_INFINITY;
	let attempts = 0;

	while (attempts < 80) {
		const letters = getRandomLetterSet(words, random, {
			recentHistory,
			viableLetterSets,
		});
		const filteredWords = filterWordsByLetters(words, letters);
		if (filteredWords.length < requiredMinWords) {
			attempts++;
			continue;
		}

		try {
			const result = generateCrossword(
				filteredWords,
				requiredMinWords,
				safeMaxWords,
				random,
				wordPenalties,
			);
			if (
				result.words.length < requiredMinWords ||
				result.cols < MIN_GRID_COLS
			) {
				attempts++;
				continue;
			}

			const usedLetters = new Set(
				result.words.flatMap((placement) =>
					normalizeWord(placement.word.name).split(""),
				),
			);

			if (!letters.every((letter) => usedLetters.has(letter))) {
				attempts++;
				continue;
			}

			const selectedWords = result.words.map(
				(placement) => placement.word.name,
			);
			const baseScore = scoreWordLengthProfile(
				getWordLengthProfile(result.words.map((placement) => placement.word)),
			);
			const freshnessPenalty = calculateCandidateFreshnessPenalty(
				letters,
				selectedWords,
				recentHistory,
			);
			const rootCollisionPenalty =
				countSameRootPairs(result.words.map((placement) => placement.word)) *
				SAME_ROOT_PAIR_PENALTY;
			const score = baseScore - freshnessPenalty - rootCollisionPenalty;

			if (score > bestScore) {
				bestScore = score;
				bestCrossword = result;
				bestLetters = letters;
			}

			if (
				baseScore >= STRONG_DIVERSITY_SCORE &&
				freshnessPenalty <= 2 &&
				rootCollisionPenalty === 0
			) {
				break;
			}
		} catch (_e) {
			// continue
		}

		attempts++;
	}

	if (!bestCrossword) {
		return null;
	}

	return {
		crossword: bestCrossword,
		letters: bestLetters,
		shuffledLetters: random.shuffleArray(bestLetters),
		summary: summarizeDailyGeneration(bestLetters, bestCrossword),
	};
}

function buildHistoryFromCache(
	seed: number,
	cache: Map<number, DailyGenerationResult | null>,
): DailyPuzzleHistoryEntry[] {
	const dateKey = seedToDateKey(seed);
	const history: DailyPuzzleHistoryEntry[] = [];

	for (let daysAgo = 1; daysAgo <= HISTORY_LOOKBACK_DAYS; daysAgo++) {
		const historicalSeed = dateKeyToSeed(addDaysToDateKey(dateKey, -daysAgo));
		const generated = cache.get(historicalSeed);

		if (!generated) {
			continue;
		}

		history.push({
			daysAgo,
			...generated.summary,
		});
	}

	return history;
}

export { shuffleArray } from "@/lib/shuffle";
