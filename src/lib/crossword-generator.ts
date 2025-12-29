// Crossword generator for Catalan word game

import type { Word } from "@/data/types";

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

interface Candidate {
	word: Word;
	row: number;
	col: number;
	direction: "horizontal" | "vertical";
	intersections: number;
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
	minWords = 5,
	maxWords = 15,
	random: SeededRandom = new SeededRandom(Date.now()),
): CrosswordGrid {
	// Filter words: 3-12 letters, only letters
	const validWords = random
		.shuffleArray(
			words
				.filter((w) => w.name.length >= 3 && w.name.length <= 12)
				.filter((w) => /^[a-záàéèíïóòúüç·]+$/i.test(w.name)),
		)
		.slice(0, Math.min(words.length, maxWords * 3)); // Take more than needed for better chances

	if (validWords.length === 0) {
		throw new Error("No valid words available");
	}

	// Try to generate a crossword multiple times
	for (let attempt = 0; attempt < 50; attempt++) {
		const result = tryGenerateCrossword(validWords, minWords, maxWords);
		if (result && result.words.length >= minWords) {
			return result;
		}
	}

	// Fallback: create a simple crossword with the first word
	return createFallbackCrossword(validWords.slice(0, minWords));
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
		} else {
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

	return hasIntersection;
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
		if (normalized.length < 3) {
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

/**
 * Pick 6 random letters that produce a good amount of words
 */
export function getRandomLetterSet(
	words: Word[],
	random: SeededRandom = new SeededRandom(Date.now()),
): string[] {
	// Try to find a word with 6 unique letters to use as our set
	const candidates = words.filter((w) => {
		const normalized = normalizeWord(w.name);
		const uniqueChars = new Set(normalized.split(""));
		return (
			uniqueChars.size === 6 &&
			normalized.length >= 6 &&
			normalized.length <= 10
		);
	});

	if (candidates.length > 0) {
		const randomWord =
			candidates[Math.floor(random.next() * candidates.length)];
		const normalized = normalizeWord(randomWord.name);
		const chars = Array.from(new Set(normalized.split("")));
		return random.shuffleArray(chars).slice(0, 6);
	}

	// Fallback: common Catalan letters
	return random.shuffleArray("aeioustrln".split("")).slice(0, 6);
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
