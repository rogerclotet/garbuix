import { beforeAll, describe, expect, it } from "vitest";
import guessWords from "@/data/catalan-guess-words.json";
import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import { countSameRootPairs } from "@/lib/crossword-generator";
import { createPuzzleEvent } from "@/lib/puzzle-client";
import { addDaysToDateKey, dateKeyToSeed } from "@/lib/puzzle-dates";
import { buildNormalizedDictionary } from "@/lib/puzzle-dictionary";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import {
	areAdjacent,
	canExtendPath,
	connectionKey,
	findWordPaths,
	getPathConnectionKeys,
	getRemainingBoard,
} from "@/lib/quadrat-board";
import {
	decodeQuadratFoundWords,
	openQuadratClueStart,
	resolveQuadratGuess,
} from "@/lib/quadrat-client";
import {
	findQuadratValidGuesses,
	type GeneratedQuadrat,
	generateQuadratPuzzle,
	type QuadratHistoryEntry,
} from "@/lib/quadrat-generator";
import {
	applyQuadratEvent,
	mergeQuadratProgress,
} from "@/lib/quadrat-progress";
import { buildQuadratSnapshots } from "@/lib/quadrat-snapshot";
import {
	QUADRAT_CELL_COUNT,
	QUADRAT_MIN_WORD_LENGTH,
	QUADRAT_WORD_COUNT,
	type QuadratPuzzlePublic,
} from "@/lib/quadrat-types";

const words = allWords as Word[];
const normalizedGuessWords = buildNormalizedDictionary(guessWords);

function expectBoardInvariants(generated: GeneratedQuadrat) {
	expect(generated.letters).toHaveLength(QUADRAT_CELL_COUNT);
	expect(generated.words).toHaveLength(QUADRAT_WORD_COUNT);
	expect(generated.words.map(({ id }) => id).sort((a, b) => a - b)).toEqual(
		Array.from({ length: QUADRAT_WORD_COUNT }, (_, index) => index),
	);

	const cellUses = new Array<number>(QUADRAT_CELL_COUNT).fill(0);
	const connectionUses = new Map<string, number>();
	for (const { normalizedWord, path } of generated.words) {
		expect(normalizedWord.length).toBeGreaterThanOrEqual(
			QUADRAT_MIN_WORD_LENGTH,
		);
		// Name the word so a failure points at it.
		expect(
			findWordPaths(generated.letters, normalizedWord),
			normalizedWord,
		).toEqual([path]);
		for (const cell of path) cellUses[cell] = (cellUses[cell] ?? 0) + 1;
		for (const key of getPathConnectionKeys(path)) {
			connectionUses.set(key, (connectionUses.get(key) ?? 0) + 1);
		}
	}

	expect(cellUses.every((uses) => uses > 0)).toBe(true);
	expect(generated.cellUses).toEqual(cellUses);
	expect(
		new Map(
			generated.connections.map(({ cells: [left, right], uses }) => [
				connectionKey(left, right),
				uses,
			]),
		),
	).toEqual(connectionUses);
	expect(countSameRootPairs(generated.words.map(({ word }) => word))).toBe(0);
}

describe("Quadrat generation", () => {
	const boards: Array<{ dateKey: string; generated: GeneratedQuadrat }> = [];

	beforeAll(() => {
		const history: QuadratHistoryEntry[] = [];
		let dateKey = "2026-10-19";
		for (let day = 0; day < 5; day++) {
			const generated = generateQuadratPuzzle(words, dateKeyToSeed(dateKey), {
				recentHistory: history.map((entry, index) => ({
					...entry,
					daysAgo: history.length - index,
				})),
			});
			boards.push({ dateKey, generated });
			history.push({
				daysAgo: 0,
				normalizedWords: generated.words.map((word) => word.normalizedWord),
			});
			dateKey = addDaysToDateKey(dateKey, 1);
		}
	});

	it("places fifteen words that each trace one path and together use every cell", () => {
		for (const { generated } of boards) expectBoardInvariants(generated);
	});

	it("draws the same board for the same day and history", () => {
		const [first] = boards;
		if (!first) throw new Error("No board generated");
		const again = generateQuadratPuzzle(words, dateKeyToSeed(first.dateKey));
		expect(again.letters).toEqual(first.generated.letters);
		expect(again.words.map(({ normalizedWord }) => normalizedWord)).toEqual(
			first.generated.words.map(({ normalizedWord }) => normalizedWord),
		);
	});

	it("steers away from words used on recent days", () => {
		const [first, second] = boards;
		if (!first || !second) throw new Error("No boards generated");
		const yesterday = new Set(
			first.generated.words.map(({ normalizedWord }) => normalizedWord),
		);
		const repeated = second.generated.words.filter(({ normalizedWord }) =>
			yesterday.has(normalizedWord),
		);
		expect(repeated.length).toBeLessThanOrEqual(2);
	});

	it("accepts as extras only words a drag can trace, never the day's words", () => {
		const [first] = boards;
		if (!first) throw new Error("No board generated");
		const { generated } = first;
		const targets = generated.words.map(({ normalizedWord }) => normalizedWord);
		const connectionKeys = new Set(
			generated.connections.map(({ cells: [left, right] }) =>
				connectionKey(left, right),
			),
		);
		const extras = findQuadratValidGuesses({
			letters: generated.letters,
			connections: generated.connections,
			normalizedWords: normalizedGuessWords,
			targetWords: targets,
		});

		expect(extras.length).toBeGreaterThan(0);
		for (const extra of extras) {
			expect(targets).not.toContain(extra);
			expect(
				findWordPaths(generated.letters, extra).some((path) =>
					getPathConnectionKeys(path).every((key) => connectionKeys.has(key)),
				),
				extra,
			).toBe(true);
		}
	});
});

// A hand-built board keeps these tests independent of the dictionary.
//   c a s a
//   o r t e
//   l l i n
//   p u m a
const FIXTURE_LETTERS = [..."casaortellinpuma"];

function buildFixture(): GeneratedQuadrat {
	const fixtureWords = [
		{ id: 0, normalizedWord: "casa", path: [0, 1, 2, 3] },
		{ id: 1, normalizedWord: "orte", path: [4, 5, 6, 7] },
	];
	return {
		letters: FIXTURE_LETTERS,
		words: fixtureWords.map((word) => ({
			...word,
			word: { name: word.normalizedWord, areatematica: "Nom", frequency: 1 },
		})),
		cellUses: [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
		connections: [
			{ cells: [0, 1], uses: 1 },
			{ cells: [1, 2], uses: 1 },
			{ cells: [2, 3], uses: 1 },
			{ cells: [4, 5], uses: 1 },
			{ cells: [5, 6], uses: 1 },
			{ cells: [6, 7], uses: 1 },
		],
	};
}

describe("Quadrat board state", () => {
	it("knows the eight neighbours of a cell", () => {
		expect(areAdjacent(5, 0)).toBe(true);
		expect(areAdjacent(5, 10)).toBe(true);
		expect(areAdjacent(3, 4)).toBe(false);
		expect(areAdjacent(5, 5)).toBe(false);
	});

	it("drops the counts and connections of found words", () => {
		const board = getRemainingBoard(buildFixture(), [[0, 1, 2, 3]]);
		expect(board.cellUses.slice(0, 8)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
		expect(board.connectionUses.get(connectionKey(0, 1))).toBe(0);
		expect(board.connectionUses.get(connectionKey(5, 6))).toBe(1);
	});

	it("lets a drag follow only drawn connections into cells still in use", () => {
		const board = getRemainingBoard(buildFixture(), []);
		expect(canExtendPath(board, [], 4)).toBe(true);
		// Cell 8 belongs to no word.
		expect(canExtendPath(board, [], 8)).toBe(false);
		expect(canExtendPath(board, [4], 5)).toBe(true);
		// Neighbours, but no word steps from 4 to 1.
		expect(canExtendPath(board, [4], 1)).toBe(false);
		expect(canExtendPath(board, [4, 5], 4)).toBe(false);

		const afterCasa = getRemainingBoard(buildFixture(), [[0, 1, 2, 3]]);
		expect(canExtendPath(afterCasa, [], 0)).toBe(false);
	});

	it("finds every path that spells a word", () => {
		expect(findWordPaths(FIXTURE_LETTERS, "casa")).toEqual([[0, 1, 2, 3]]);
		// Either L can come first, and both touch the U.
		expect(findWordPaths(FIXTURE_LETTERS, "llum")).toEqual([
			[8, 9, 13, 14],
			[9, 8, 13, 14],
		]);
	});
});

describe("Quadrat guesses", () => {
	let puzzle: QuadratPuzzlePublic;

	beforeAll(async () => {
		const { publicSnapshot } = await buildQuadratSnapshots({
			puzzleId: "quadrat:2026-10-19",
			dateKey: "2026-10-19",
			seed: dateKeyToSeed("2026-10-19"),
			algorithmVersion: "test",
			generated: buildFixture(),
			validNormalizedGuesses: ["sort"],
		});
		puzzle = publicSnapshot;
	});

	it("finds a word from its path and recovers the path from the saved token", async () => {
		const progress = createEmptyProgressState({
			id: puzzle.id,
			initialShuffledLetters: [],
		});
		const result = await resolveQuadratGuess({
			puzzle,
			progress,
			path: [0, 1, 2, 3],
		});
		expect(result.kind).toBe("new_word");
		expect(result.displayWord).toBe("casa");

		const next = applyQuadratEvent(
			puzzle,
			progress,
			createPuzzleEvent("guess_added", {
				guessHash: result.guessHash,
				matchedWordId: result.matchedSlotId,
				unlockToken: result.unlockToken,
				validNotInPuzzle: false,
			}),
		);
		await expect(decodeQuadratFoundWords(puzzle, next)).resolves.toEqual({
			answers: { 0: "casa" },
			paths: { 0: [0, 1, 2, 3] },
		});
	});

	it("tells extras apart from words outside the dictionary", async () => {
		const progress = createEmptyProgressState({
			id: puzzle.id,
			initialShuffledLetters: [],
		});
		const extra = await resolveQuadratGuess({
			puzzle,
			progress,
			path: [2, 1, 5, 6],
		});
		expect(extra.normalizedGuess).toBe("sart");
		expect(extra.kind).toBe("not_in_dictionary");

		const valid = await resolveQuadratGuess({
			puzzle: { ...puzzle, validNormalizedGuesses: ["sart"] },
			progress,
			path: [2, 1, 5, 6],
		});
		expect(valid.kind).toBe("valid_but_not_in_puzzle");
		expect(valid.matchedSlotId).toBeNull();
	});

	it("opens the first two cells of a clued word", async () => {
		const slot = puzzle.wordSlots.find(({ id }) => id === 1);
		if (!slot) throw new Error("Missing slot");
		await expect(openQuadratClueStart(slot)).resolves.toEqual([4, 5]);
	});
});

describe("Quadrat progress", () => {
	const puzzle = {
		wordSlots: Array.from({ length: 5 }, (_, id) => ({ id })),
	} as QuadratPuzzlePublic;

	it("counts three clues at most and none for found or unknown words", () => {
		let progress = {
			...createEmptyProgressState({
				id: "quadrat:x",
				initialShuffledLetters: [],
			}),
			guessedWordIds: [4],
		};
		for (const wordId of [4, 99, 0, 1, 2, 3]) {
			progress = applyQuadratEvent(
				puzzle,
				progress,
				createPuzzleEvent("text_hint_requested", { wordId }),
			);
		}
		expect(progress.clueWordIds).toEqual([0, 1, 2]);
		expect(progress.hintsUsed).toBe(3);
	});

	it("keeps the first three clues when devices merge", () => {
		const base = createEmptyProgressState({
			id: "quadrat:x",
			initialShuffledLetters: [],
		});
		const merged = mergeQuadratProgress(
			{ ...base, clueWordIds: [0, 1], hintsUsed: 2 },
			{ ...base, clueWordIds: [2, 3], hintsUsed: 2 },
		);
		expect(merged.clueWordIds).toEqual([0, 1, 2]);
		expect(merged.hintsUsed).toBe(3);
	});
});
