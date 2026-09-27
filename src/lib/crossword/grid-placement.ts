import type { Word } from "@/data/types";
import { SeededRandom } from "./seeded-random";
import {
	dedupeWordsByNormalizedForm,
	getWordCells,
	getWordRuntimeMetadata,
	prioritizeWords,
	wordsShareRoot,
} from "./word-metadata";
export const DEFAULT_MIN_WORDS = 10;
export const DEFAULT_MAX_WORDS = 15;
export const MIN_GRID_COLS = 8;
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

interface Candidate {
	word: Word;
	row: number;
	col: number;
	direction: "horizontal" | "vertical";
	intersections: number;
}

/**
 * Generate a crossword grid with the given words
 */
export function generateCrossword(
	words: Word[],
	minWords = DEFAULT_MIN_WORDS,
	maxWords = DEFAULT_MAX_WORDS,
	random: SeededRandom = new SeededRandom(Date.now()),
	wordPenalties?: Map<string, number>,
): CrosswordGrid {
	const requiredMinWords = Math.max(minWords, DEFAULT_MIN_WORDS);
	const safeMaxWords = Math.max(maxWords, requiredMinWords);
	const uniqueWords = dedupeWordsByNormalizedForm(words);

	// Filter words: 4-12 letters, only letters
	const candidateWords = prioritizeWords(
		uniqueWords.filter(
			(word) => getWordRuntimeMetadata(word).isCrosswordCandidate,
		),
		random,
		wordPenalties,
	);
	const validWords = candidateWords.slice(
		0,
		Math.min(candidateWords.length, safeMaxWords * 5),
	); // Keep a larger pool so higher-quality words still have placement options

	if (validWords.length < requiredMinWords) {
		throw new Error("Not enough valid words available");
	}

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

export function tryGenerateCrossword(
	words: Word[],
	minWords: number,
	maxWords: number,
): CrosswordGrid | null {
	const placements: WordPlacement[] = [];
	const grid: Map<string, GridCell> = new Map();

	// Place first word horizontally in the middle
	const MAX_GRID_SIZE = 15;
	const firstWord = words[0];
	const firstWordLetters = getWordCells(firstWord);
	// Place the first word around the center of the potential 15x15 grid
	const startRow = Math.floor((MAX_GRID_SIZE - firstWordLetters.length) / 2);
	const startCol = Math.floor((MAX_GRID_SIZE - firstWordLetters.length) / 2);

	placements.push({
		id: 0,
		word: firstWord,
		startRow,
		startCol,
		direction: "horizontal",
		revealed: false,
	});

	for (let i = 0; i < firstWordLetters.length; i++) {
		const key = `${startRow},${startCol + i}`;
		grid.set(key, {
			letter: firstWordLetters[i] ?? "",
			wordIds: [0],
		});
	}

	// Try to place remaining words
	let wordId = 1;

	const tryPlace = (word: Word): boolean => {
		if (placements.length >= maxWords) {
			return false;
		}

		const placement = findBestPlacement(word, placements, grid, wordId);
		if (!placement) {
			return false;
		}

		placements.push(placement);
		const wordLetters = getWordCells(word);
		for (let j = 0; j < wordLetters.length; j++) {
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
					letter: wordLetters[j] ?? "",
					wordIds: [wordId],
				});
			}
		}
		wordId++;
		return true;
	};

	// Pass 1: place words whose root is not already represented in the puzzle,
	// deferring morphological siblings so distinct roots are preferred.
	const deferred: Word[] = [];
	for (let i = 1; i < words.length && placements.length < maxWords; i++) {
		const word = words[i];
		if (placements.some((placement) => wordsShareRoot(placement.word, word))) {
			deferred.push(word);
			continue;
		}
		tryPlace(word);
	}

	// Pass 2: only if distinct-root words couldn't fill the puzzle, top it up
	// with the deferred siblings to reach the target count.
	for (const word of deferred) {
		if (placements.length >= maxWords) {
			break;
		}
		tryPlace(word);
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
	const wordLetters = getWordCells(word);
	for (const placement of placements) {
		const existingWord = placement.word;
		const existingWordLetters = getWordCells(existingWord);

		// Try both directions
		for (const direction of ["horizontal", "vertical"] as const) {
			// Skip if same direction as existing word
			if (direction === placement.direction) continue;

			// Check each letter of the existing word
			for (let i = 0; i < existingWordLetters.length; i++) {
				const existingLetter = existingWordLetters[i];

				// Check each letter of the new word
				for (let j = 0; j < wordLetters.length; j++) {
					if (wordLetters[j] === existingLetter) {
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
	const wordLetters = getWordCells(word);

	// Check bounds
	if (
		startRow < 0 ||
		startCol < 0 ||
		(direction === "horizontal" &&
			startCol + wordLetters.length > MAX_GRID_SIZE) ||
		(direction === "vertical" && startRow + wordLetters.length > MAX_GRID_SIZE)
	) {
		return false;
	}

	const isHorizontal = direction === "horizontal";
	let hasIntersection = false;
	let hasNewCell = false;
	const overlapsByWordId = new Map<number, number>();

	// Check each cell
	for (let i = 0; i < wordLetters.length; i++) {
		const row = isHorizontal ? startRow : startRow + i;
		const col = isHorizontal ? startCol + i : startCol;
		const key = `${row},${col}`;
		const cell = grid.get(key);

		if (cell) {
			// Cell is occupied
			if (cell.letter !== wordLetters[i]) {
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
	const afterRow = isHorizontal ? startRow : startRow + wordLetters.length;
	const afterCol = isHorizontal ? startCol + wordLetters.length : startCol;

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
	const wordLetters = getWordCells(word);

	for (let i = 0; i < wordLetters.length; i++) {
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
		const wordLetters = getWordCells(word);

		placements.push({
			id: wordId,
			word,
			startRow: currentRow,
			startCol: currentCol,
			direction,
			revealed: false,
		});

		// Add to grid
		for (let j = 0; j < wordLetters.length; j++) {
			const row = direction === "horizontal" ? currentRow : currentRow + j;
			const col = direction === "horizontal" ? currentCol + j : currentCol;
			const key = `${row},${col}`;

			const existing = grid.get(key);
			if (existing) {
				existing.wordIds.push(wordId);
			} else {
				grid.set(key, {
					letter: wordLetters[j] ?? "",
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
