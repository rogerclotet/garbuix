import { describe, expect, it } from "vitest";
import { resolveGuess } from "@/lib/puzzle-client";
import { createGuessHash, createUnlockToken } from "@/lib/puzzle-crypto";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import { buildPuzzleSnapshots } from "@/lib/puzzle-snapshot";

async function buildTestPuzzle() {
	const { publicSnapshot } = await buildPuzzleSnapshots({
		puzzleId: "puzzle-1",
		dateKey: "2026-04-11",
		seed: 260411,
		algorithmVersion: "1",
		letters: ["c", "o", "s", "a"],
		initialShuffledLetters: ["c", "o", "s", "a"],
		crossword: {
			rows: 1,
			cols: 4,
			grid: [
				Array.from("cosa").map((letter) => ({
					letter,
					wordIds: [0],
				})),
			],
			words: [
				{
					id: 0,
					startRow: 0,
					startCol: 0,
					direction: "horizontal",
					revealed: false,
					word: {
						name: "cosa",
						areatematica: "Nom",
						frequency: 1,
					},
				},
			],
		},
	});

	return {
		...publicSnapshot,
		validNormalizedGuesses: ["cosa", "saco"],
	};
}

describe("resolveGuess", () => {
	it("classifies a newly found puzzle word", async () => {
		const puzzle = await buildTestPuzzle();
		const result = await resolveGuess({
			puzzle,
			progress: createEmptyProgressState(puzzle),
			guess: "Cosa",
		});

		expect(result.kind).toBe("new_word");
		expect(result.isRepeatGuess).toBe(false);
		expect(result.normalizedGuess).toBe("cosa");
		expect(result.displayWord).toBe("cosa");
		expect(result.matchedSlotId).toBe(0);
		expect(result.unlockToken).not.toBeNull();
	});

	it("classifies an already found puzzle word", async () => {
		const puzzle = await buildTestPuzzle();
		const unlockToken = await createUnlockToken(
			puzzle.wordSlots[0].slotSalt,
			"cosa",
		);
		const progress = {
			...createEmptyProgressState(puzzle),
			guessedWordIds: [0],
			revealedWordTokens: {
				"0": unlockToken,
			},
		};

		const result = await resolveGuess({
			puzzle,
			progress,
			guess: "cosa",
		});

		expect(result.kind).toBe("already_found");
		expect(result.isRepeatGuess).toBe(true);
		expect(result.displayWord).toBe("cosa");
		expect(result.matchedSlotId).toBe(0);
	});

	it("re-emits valid_but_not_in_puzzle when the same valid non-puzzle word is guessed again", async () => {
		const puzzle = await buildTestPuzzle();
		const guessHash = await createGuessHash(puzzle.id, "saco");
		const progress = {
			...createEmptyProgressState(puzzle),
			guessHashes: [guessHash],
			guessCount: 1,
		};

		const result = await resolveGuess({
			puzzle,
			progress,
			guess: "saco",
		});

		expect(result.kind).toBe("valid_but_not_in_puzzle");
		expect(result.isRepeatGuess).toBe(true);
		expect(result.displayWord).toBeNull();
		expect(result.matchedSlotId).toBeNull();
	});

	it("re-emits not_in_dictionary when the same unknown word is guessed again", async () => {
		const puzzle = await buildTestPuzzle();
		const guessHash = await createGuessHash(puzzle.id, "xoca");
		const progress = {
			...createEmptyProgressState(puzzle),
			guessHashes: [guessHash],
			guessCount: 1,
		};

		const result = await resolveGuess({
			puzzle,
			progress,
			guess: "xoca",
		});

		expect(result.kind).toBe("not_in_dictionary");
		expect(result.isRepeatGuess).toBe(true);
		expect(result.displayWord).toBeNull();
		expect(result.matchedSlotId).toBeNull();
	});

	it("classifies a valid word that is not in the puzzle", async () => {
		const puzzle = await buildTestPuzzle();
		const result = await resolveGuess({
			puzzle,
			progress: createEmptyProgressState(puzzle),
			guess: "saco",
		});

		expect(result.kind).toBe("valid_but_not_in_puzzle");
		expect(result.isRepeatGuess).toBe(false);
		expect(result.displayWord).toBeNull();
		expect(result.matchedSlotId).toBeNull();
	});

	it("classifies a non-dictionary word", async () => {
		const puzzle = await buildTestPuzzle();
		const result = await resolveGuess({
			puzzle,
			progress: createEmptyProgressState(puzzle),
			guess: "xoca",
		});

		expect(result.kind).toBe("not_in_dictionary");
		expect(result.isRepeatGuess).toBe(false);
		expect(result.displayWord).toBeNull();
		expect(result.matchedSlotId).toBeNull();
	});
});
