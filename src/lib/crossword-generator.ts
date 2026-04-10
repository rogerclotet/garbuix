// Crossword generator for Catalan word game

import type { Word } from "@/data/types";
import { dateKeyToSeed, seedToDateKey } from "@/lib/puzzle-dates";

const DEFAULT_MIN_WORDS = 10;
const DEFAULT_MAX_WORDS = 15;
const MIN_GRID_COLS = 8;
const LETTER_CANDIDATE_POOL_SIZE = 256;
const LETTER_CANDIDATE_RANK_BIAS = 1.4;
const LETTER_NOVELTY_WEIGHT = 0.5;
const LETTER_NOVELTY_WINDOW_DAYS = 14;
const MAX_LETTER_OVERLAP_HARD = 4;
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

/**
 * Seeded random number generator for reproducible crosswords
 */
export class SeededRandom {
	private seed: number;

	constructor(seed: number) {
		this.seed = seed;
	}

	// Mulberry32 algorithm
	next(): number {
		this.seed += 0x6d2b79f5;
		let t = this.seed;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	shuffleArray<T>(array: T[]): T[] {
		const newArray = [...array];
		for (let i = newArray.length - 1; i > 0; i--) {
			const j = Math.floor(this.next() * (i + 1));
			[newArray[i], newArray[j]] = [newArray[j], newArray[i]];
		}
		return newArray;
	}
}

export interface GridCell {
	letter: string;
	wordIds: number[];
}

export interface WordPlacement {
	id: number;
	word: Word;
	startRow: number;
	startCol: number;
	direction: "horizontal" | "vertical";
	revealed: boolean;
}

export interface CrosswordGrid {
	grid: (GridCell | null)[][];
	words: WordPlacement[];
	rows: number;
	cols: number;
}

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

interface Candidate {
	word: Word;
	row: number;
	col: number;
	direction: "horizontal" | "vertical";
	intersections: number;
}

export type ViableLetterSet = {
	key: string;
	letters: string[];
	eligibleCount: number;
	maxFrequency: number;
};

type WordLike = {
	name: string;
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

function getLengthPriority(normalizedLength: number): number {
	if (normalizedLength === 4) {
		return -0.2;
	}

	if (normalizedLength === 5) {
		return 0.05;
	}

	if (normalizedLength >= 6 && normalizedLength <= 8) {
		return 0.55;
	}

	if (normalizedLength <= 10) {
		return 0.65;
	}

	return 0.3;
}

function getWordPriority(word: Word): number {
	const normalizedLength = normalizeWord(word.name).length;
	const frequencyScore = Math.log10((word.frequency ?? 0) + 10);
	const lengthBonus = getLengthPriority(normalizedLength);
	const partOfSpeechBonus = word.areatematica.includes("Nom")
		? 0.2
		: word.areatematica.includes("Adjectiu")
			? 0.15
			: word.areatematica.includes("Verb")
				? 0.1
				: 0.05;

	return frequencyScore + lengthBonus + partOfSpeechBonus;
}

function compareWordsForSelection(left: Word, right: Word): number {
	const priorityDelta = getWordPriority(right) - getWordPriority(left);
	if (priorityDelta !== 0) {
		return priorityDelta;
	}

	if (right.frequency !== left.frequency) {
		return right.frequency - left.frequency;
	}

	return left.name.localeCompare(right.name, "ca");
}

function dedupeWordsByNormalizedForm(words: Word[]): Word[] {
	const bestWordByNormalizedForm = new Map<string, Word>();

	for (const word of words) {
		const normalized = normalizeWord(word.name);
		const existing = bestWordByNormalizedForm.get(normalized);
		if (!existing || compareWordsForSelection(word, existing) < 0) {
			bestWordByNormalizedForm.set(normalized, word);
		}
	}

	return [...bestWordByNormalizedForm.values()];
}

function prioritizeWords(words: Word[], random: SeededRandom): Word[] {
	return words
		.map((word) => ({
			word,
			score: getWordPriority(word) + random.next() * 1.0,
		}))
		.sort((a, b) => b.score - a.score)
		.map(({ word }) => word);
}

function getWordLengthProfile(words: WordLike[]): WordLengthProfile {
	const lengths = words.map((word) => normalizeWord(word.name).length);
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

/**
 * Normalize a word by removing accents and converting to lowercase
 */
export function normalizeWord(word: string): string {
	return word
		.toLowerCase()
		.normalize("NFD")
		.replace(/c\u0327/g, "ç") // Keep ç as a distinct letter
		.replace(/[\u0300-\u036f]/g, "") // Remove other diacritics
		.normalize("NFC")
		.replace(/[·]/g, ""); // Remove middle dot
}

/**
 * Check if two words match when normalized (without accents)
 */
export function wordsMatch(word1: string, word2: string): boolean {
	return normalizeWord(word1) === normalizeWord(word2);
}

/**
 * Generate a crossword grid with the given words
 */
export function generateCrossword(
	words: Word[],
	minWords = DEFAULT_MIN_WORDS,
	maxWords = DEFAULT_MAX_WORDS,
	random: SeededRandom = new SeededRandom(Date.now()),
): CrosswordGrid {
	const requiredMinWords = Math.max(minWords, DEFAULT_MIN_WORDS);
	const safeMaxWords = Math.max(maxWords, requiredMinWords);
	const uniqueWords = dedupeWordsByNormalizedForm(words);

	// Filter words: 4-12 letters, only letters
	const candidateWords = prioritizeWords(
		uniqueWords
			.filter((w) => w.name.length >= 4 && w.name.length <= 12)
			.filter((w) => /^[a-záàéèíïóòúüç·]+$/i.test(w.name)),
		random,
	);
	const validWords = candidateWords.slice(
		0,
		Math.min(candidateWords.length, safeMaxWords * 5),
	); // Keep a larger pool so higher-quality words still have placement options

	if (validWords.length < requiredMinWords) {
		throw new Error("Not enough valid words available");
	}

	// Try to generate a crossword multiple times
	for (let attempt = 0; attempt < 50; attempt++) {
		const result = tryGenerateCrossword(
			validWords,
			requiredMinWords,
			safeMaxWords,
		);
		if (result && result.words.length >= requiredMinWords) {
			const normalizedResult = ensureMinimumGridWidth(result, MIN_GRID_COLS);
			if (allWordsHaveIntersections(normalizedResult)) {
				return normalizedResult;
			}
		}
	}

	// Fallback: create a simple crossword with the first word
	const fallback = ensureMinimumGridWidth(
		createFallbackCrossword(validWords.slice(0, requiredMinWords)),
		MIN_GRID_COLS,
	);
	if (allWordsHaveIntersections(fallback)) {
		return fallback;
	}

	throw new Error("Failed to generate a valid crossword");
}

function tryGenerateCrossword(
	words: Word[],
	minWords: number,
	maxWords: number,
): CrosswordGrid | null {
	const placements: WordPlacement[] = [];
	const grid: Map<string, GridCell> = new Map();

	// Place first word horizontally in the middle
	const MAX_GRID_SIZE = 15;
	const firstWord = words[0];
	// Place the first word around the center of the potential 15x15 grid
	const startRow = Math.floor((MAX_GRID_SIZE - firstWord.name.length) / 2);
	const startCol = Math.floor((MAX_GRID_SIZE - firstWord.name.length) / 2);

	placements.push({
		id: 0,
		word: firstWord,
		startRow,
		startCol,
		direction: "horizontal",
		revealed: false,
	});

	for (let i = 0; i < firstWord.name.length; i++) {
		const key = `${startRow},${startCol + i}`;
		grid.set(key, {
			letter: firstWord.name[i],
			wordIds: [0],
		});
	}

	// Try to place remaining words
	let wordId = 1;
	for (let i = 1; i < words.length && placements.length < maxWords; i++) {
		const word = words[i];
		const placement = findBestPlacement(word, placements, grid, wordId);

		if (placement) {
			placements.push(placement);
			// Add to grid
			for (let j = 0; j < word.name.length; j++) {
				const row =
					placement.direction === "horizontal"
						? placement.startRow
						: placement.startRow + j;
				const col =
					placement.direction === "horizontal"
						? placement.startCol + j
						: placement.startCol;
				const key = `${row},${col}`;

				const existing = grid.get(key);
				if (existing) {
					existing.wordIds.push(wordId);
				} else {
					grid.set(key, {
						letter: word.name[j],
						wordIds: [wordId],
					});
				}
			}
			wordId++;
		}
	}

	if (placements.length < minWords) {
		return null;
	}

	// Convert to 2D array
	return convertToGrid(grid, placements);
}

function findBestPlacement(
	word: Word,
	placements: WordPlacement[],
	grid: Map<string, GridCell>,
	wordId: number,
): WordPlacement | null {
	const candidates: Candidate[] = [];

	// Try to find intersections with existing words
	for (const placement of placements) {
		const existingWord = placement.word;

		// Try both directions
		for (const direction of ["horizontal", "vertical"] as const) {
			// Skip if same direction as existing word
			if (direction === placement.direction) continue;

			// Check each letter of the existing word
			for (let i = 0; i < existingWord.name.length; i++) {
				const existingLetter = existingWord.name[i];

				// Check each letter of the new word
				for (let j = 0; j < word.name.length; j++) {
					if (word.name[j] === existingLetter) {
						// Found potential intersection
						let row: number, col: number;

						if (direction === "horizontal") {
							// New word is horizontal, existing is vertical
							row = placement.startRow + i;
							col = placement.startCol - j;
						} else {
							// New word is vertical, existing is horizontal
							row = placement.startRow - j;
							col = placement.startCol + i;
						}

						// Check if this placement is valid
						if (isValidPlacement(word, row, col, direction, grid)) {
							const intersections = countIntersections(
								word,
								row,
								col,
								direction,
								grid,
							);
							candidates.push({
								word,
								row,
								col,
								direction,
								intersections,
							});
						}
					}
				}
			}
		}
	}

	// Sort by most intersections
	candidates.sort((a, b) => b.intersections - a.intersections);

	if (candidates.length > 0) {
		const best = candidates[0];
		return {
			id: wordId,
			word: best.word,
			startRow: best.row,
			startCol: best.col,
			direction: best.direction,
			revealed: false,
		};
	}

	return null;
}

function isValidPlacement(
	word: Word,
	startRow: number,
	startCol: number,
	direction: "horizontal" | "vertical",
	grid: Map<string, GridCell>,
): boolean {
	const MAX_GRID_SIZE = 15;

	// Check bounds
	if (
		startRow < 0 ||
		startCol < 0 ||
		(direction === "horizontal" &&
			startCol + word.name.length > MAX_GRID_SIZE) ||
		(direction === "vertical" && startRow + word.name.length > MAX_GRID_SIZE)
	) {
		return false;
	}

	const isHorizontal = direction === "horizontal";
	let hasIntersection = false;
	let hasNewCell = false;
	const overlapsByWordId = new Map<number, number>();

	// Check each cell
	for (let i = 0; i < word.name.length; i++) {
		const row = isHorizontal ? startRow : startRow + i;
		const col = isHorizontal ? startCol + i : startCol;
		const key = `${row},${col}`;
		const cell = grid.get(key);

		if (cell) {
			// Cell is occupied
			if (cell.letter !== word.name[i]) {
				return false; // Letter mismatch
			}
			hasIntersection = true;
			for (const existingWordId of cell.wordIds) {
				const overlapCount = (overlapsByWordId.get(existingWordId) ?? 0) + 1;
				if (overlapCount > 1) {
					return false;
				}
				overlapsByWordId.set(existingWordId, overlapCount);
			}
		} else {
			hasNewCell = true;
			// Check adjacent cells (no touching words)
			const adjacentPositions = isHorizontal
				? [
						[row - 1, col],
						[row + 1, col],
					]
				: [
						[row, col - 1],
						[row, col + 1],
					];

			for (const [adjRow, adjCol] of adjacentPositions) {
				const adjKey = `${adjRow},${adjCol}`;
				if (grid.has(adjKey)) {
					return false; // Adjacent word
				}
			}
		}
	}

	// Check before and after the word
	const beforeRow = isHorizontal ? startRow : startRow - 1;
	const beforeCol = isHorizontal ? startCol - 1 : startCol;
	const afterRow = isHorizontal ? startRow : startRow + word.name.length;
	const afterCol = isHorizontal ? startCol + word.name.length : startCol;

	if (
		grid.has(`${beforeRow},${beforeCol}`) ||
		grid.has(`${afterRow},${afterCol}`)
	) {
		return false;
	}

	return hasIntersection && hasNewCell;
}

function countIntersections(
	word: Word,
	startRow: number,
	startCol: number,
	direction: "horizontal" | "vertical",
	grid: Map<string, GridCell>,
): number {
	let count = 0;
	const isHorizontal = direction === "horizontal";

	for (let i = 0; i < word.name.length; i++) {
		const row = isHorizontal ? startRow : startRow + i;
		const col = isHorizontal ? startCol + i : startCol;
		const key = `${row},${col}`;

		if (grid.has(key)) {
			count++;
		}
	}

	return count;
}

function convertToGrid(
	gridMap: Map<string, GridCell>,
	placements: WordPlacement[],
): CrosswordGrid {
	let minRow = Infinity,
		maxRow = -Infinity;
	let minCol = Infinity,
		maxCol = -Infinity;

	// Find bounds
	for (const key of gridMap.keys()) {
		const [row, col] = key.split(",").map(Number);
		minRow = Math.min(minRow, row);
		maxRow = Math.max(maxRow, row);
		minCol = Math.min(minCol, col);
		maxCol = Math.max(maxCol, col);
	}

	const rows = maxRow - minRow + 1;
	const cols = maxCol - minCol + 1;

	// Create 2D array
	const grid: (GridCell | null)[][] = Array(rows)
		.fill(null)
		.map(() => Array(cols).fill(null));

	// Fill grid
	for (const [key, cell] of gridMap) {
		const [row, col] = key.split(",").map(Number);
		grid[row - minRow][col - minCol] = cell;
	}

	// Adjust placements to new coordinate system
	const adjustedPlacements = placements.map((p) => ({
		...p,
		startRow: p.startRow - minRow,
		startCol: p.startCol - minCol,
	}));

	return {
		grid,
		words: adjustedPlacements,
		rows,
		cols,
	};
}

function ensureMinimumGridWidth(
	crossword: CrosswordGrid,
	minCols: number,
): CrosswordGrid {
	if (crossword.cols >= minCols) {
		return crossword;
	}

	const totalPadding = minCols - crossword.cols;
	const leftPadding = Math.floor(totalPadding / 2);
	const rightPadding = totalPadding - leftPadding;

	const paddedGrid = crossword.grid.map((row) => [
		...Array(leftPadding).fill(null),
		...row,
		...Array(rightPadding).fill(null),
	]);

	const adjustedPlacements = crossword.words.map((word) => ({
		...word,
		startCol: word.startCol + leftPadding,
	}));

	return {
		...crossword,
		grid: paddedGrid,
		words: adjustedPlacements,
		cols: minCols,
	};
}

function allWordsHaveIntersections(crossword: CrosswordGrid): boolean {
	const intersectingWordIds = new Set<number>();

	for (const row of crossword.grid) {
		for (const cell of row) {
			if (!cell || cell.wordIds.length < 2) {
				continue;
			}
			for (const wordId of cell.wordIds) {
				intersectingWordIds.add(wordId);
			}
		}
	}

	return crossword.words.every((word) => intersectingWordIds.has(word.id));
}

function createFallbackCrossword(words: Word[]): CrosswordGrid {
	const placements: WordPlacement[] = [];
	const grid: Map<string, GridCell> = new Map();

	let currentRow = 0;
	let currentCol = 0;
	let wordId = 0;

	// Place words in a simple pattern
	for (let i = 0; i < words.length; i++) {
		const word = words[i];
		const direction = i % 2 === 0 ? "horizontal" : "vertical";

		placements.push({
			id: wordId,
			word,
			startRow: currentRow,
			startCol: currentCol,
			direction,
			revealed: false,
		});

		// Add to grid
		for (let j = 0; j < word.name.length; j++) {
			const row = direction === "horizontal" ? currentRow : currentRow + j;
			const col = direction === "horizontal" ? currentCol + j : currentCol;
			const key = `${row},${col}`;

			const existing = grid.get(key);
			if (existing) {
				existing.wordIds.push(wordId);
			} else {
				grid.set(key, {
					letter: word.name[j],
					wordIds: [wordId],
				});
			}
		}

		// Move to next position
		if (direction === "horizontal") {
			currentRow += 2;
		} else {
			currentCol += 2;
		}

		wordId++;
	}

	return convertToGrid(grid, placements);
}

/**
 * Filter words that can be formed using only the given set of letters
 * (letters can be repeated, accents are ignored)
 */
export function filterWordsByLetters(
	words: Word[],
	allowedLetters: string[],
): Word[] {
	const normalizedAllowed = new Set(
		allowedLetters.map((l) => normalizeWord(l)),
	);

	return words.filter((word) => {
		const normalized = normalizeWord(word.name);
		if (normalized.length < 4) {
			return false;
		}

		for (const char of normalized) {
			if (!normalizedAllowed.has(char)) {
				return false;
			}
		}
		return true;
	});
}

let viableLetterSetsCache: {
	words: Word[];
	result: ViableLetterSet[];
} | null = null;

/**
 * Precompute all viable 6-letter sets from the dictionary.
 * Groups words by their unique letter sets and filters to sets that produce
 * enough eligible words for a crossword puzzle. Results are cached by
 * reference equality on the words array.
 */
export function computeViableLetterSets(words: Word[]): ViableLetterSet[] {
	if (viableLetterSetsCache?.words === words) {
		return viableLetterSetsCache.result;
	}

	// Precompute normalized forms for efficiency
	const normalizedForms = words.map((w) => normalizeWord(w.name));

	// Find all words with exactly 6 unique letters (length 6-10) and group by letter set
	const groups = new Map<string, { letters: string[]; maxFrequency: number }>();
	for (let i = 0; i < words.length; i++) {
		const norm = normalizedForms[i];
		const uniqueChars = new Set(norm.split(""));
		if (uniqueChars.size !== 6 || norm.length < 6 || norm.length > 10) {
			continue;
		}
		const letters = [...uniqueChars].sort();
		const key = letters.join("");
		const existing = groups.get(key);
		if (existing) {
			existing.maxFrequency = Math.max(
				existing.maxFrequency,
				words[i].frequency,
			);
		} else {
			groups.set(key, { letters, maxFrequency: words[i].frequency });
		}
	}

	// Filter to sets that produce enough eligible words
	const result: ViableLetterSet[] = [];
	for (const [key, group] of groups) {
		const normalizedAllowed = new Set(group.letters);
		let eligibleCount = 0;
		for (const norm of normalizedForms) {
			if (norm.length < 4) continue;
			let valid = true;
			for (const char of norm) {
				if (!normalizedAllowed.has(char)) {
					valid = false;
					break;
				}
			}
			if (valid) eligibleCount++;
		}

		if (eligibleCount >= DEFAULT_MIN_WORDS) {
			result.push({
				key,
				letters: group.letters,
				eligibleCount,
				maxFrequency: group.maxFrequency,
			});
		}
	}

	viableLetterSetsCache = { words, result };
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
			(sum, l) => sum + Math.max(0, 1 - (letterHeat.get(l) ?? 0) * 0.3),
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
			const score = baseScore - freshnessPenalty;

			if (score > bestScore) {
				bestScore = score;
				bestCrossword = result;
				bestLetters = letters;
			}

			if (baseScore >= STRONG_DIVERSITY_SCORE && freshnessPenalty <= 2) {
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

/**
 * Shuffle an array
 */
export function shuffleArray<T>(array: T[]): T[] {
	const newArray = [...array];
	for (let i = newArray.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[newArray[i], newArray[j]] = [newArray[j], newArray[i]];
	}
	return newArray;
}
