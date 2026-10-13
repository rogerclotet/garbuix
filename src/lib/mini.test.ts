import { describe, expect, it } from "vitest";
import { MINI_WORDS } from "@/data/mini-words";
import { getMiniDictionary } from "@/lib/mini-dictionary.server";
import { generateMiniCrossword } from "@/lib/mini-generator";
import {
	applyMiniEvent,
	createWordsRevealedEvent,
	mergeMiniProgress,
} from "@/lib/mini-progress";
import {
	createPuzzleEvent,
	decodeHintLetters,
	decodeRevealedAnswers,
	findFullyRevealedWords,
	resolveFoundWords,
	resolveGuess,
} from "@/lib/puzzle-client";
import { createGuessHash } from "@/lib/puzzle-crypto";
import { addDaysToDateKey } from "@/lib/puzzle-dates";
import {
	buildCellLetters,
	buildRevealedCells,
	getRandomHintCellKey,
	getSlotCellKey,
} from "@/lib/puzzle-helpers";
import {
	applyPuzzleEvent,
	createEmptyProgressState,
} from "@/lib/puzzle-progress";
import { buildPuzzleSnapshots } from "@/lib/puzzle-snapshot";
import { normalizeWord } from "@/lib/puzzle-text";

async function fixture() {
	const generated = generateMiniCrossword("2026-09-26");
	return buildPuzzleSnapshots({
		...generated,
		initialShuffledLetters: generated.shuffledLetters,
		dateKey: "2026-09-26",
		seed: 260926,
		puzzleId: "mini:2026-09-26",
		algorithmVersion: "mini-v1",
	});
}

describe("Mini puzzles", () => {
	it("validates only dictionary extras of three to five letters from the bank", async () => {
		const { publicSnapshot } = await fixture();
		const letters = ["a", "c", "l", "o", "p", "s"];
		const dictionary = getMiniDictionary(letters);
		const puzzle = { ...publicSnapshot, letters, ...dictionary };
		let progress = createEmptyProgressState(puzzle);
		for (const word of ["sol", "casa", "salsa"]) {
			const result = await resolveGuess({ puzzle, progress, guess: word });
			expect(result.kind).toBe("valid_but_not_in_puzzle");
			const event = createPuzzleEvent("guess_added", {
				guessHash: result.guessHash,
				matchedWordId: result.matchedSlotId,
				unlockToken: result.unlockToken,
				validNotInPuzzle: true,
			});
			progress = applyMiniEvent(puzzle, progress, event);
			expect(applyMiniEvent(puzzle, progress, event)).toBe(progress);
		}
		expect(progress.bonusWordsFound).toBe(3);
		expect(progress.completedAt).toBeNull();
		expect(mergeMiniProgress(null, progress).bonusWordsFound).toBe(3);
		for (const word of ["pa", "cassola", "avió", "sss"]) {
			expect((await resolveGuess({ puzzle, progress, guess: word })).kind).toBe(
				"not_in_dictionary",
			);
		}
		expect(
			dictionary.validNormalizedGuesses.every(
				(word) => word.length >= 3 && word.length <= 5,
			),
		).toBe(true);
		const found = await resolveFoundWords({
			puzzle,
			guessHashes: [
				...progress.guessHashes,
				await createGuessHash(puzzle.id, "pa"),
				await createGuessHash(puzzle.id, "cassola"),
			],
			revealedAnswers: {},
		});
		expect(found.map(({ word }) => word)).toEqual(["casa", "salsa", "sol"]);
		const accented = getMiniDictionary(["a", "v", "i", "o", "n", "e"]);
		expect(accented.validNormalizedGuesses).toContain("avio");
		expect(accented.displayWords.avio).toBe("avió");
	});

	it("generates five connected, familiar short words for every day of a year", () => {
		const seenWords = new Set<string>();
		const boards = new Set<string>();
		for (let day = 0; day < 365; day++) {
			const { crossword, letters, shuffledLetters } = generateMiniCrossword(
				addDaysToDateKey("2026-01-01", day),
			);
			expect(crossword.words).toHaveLength(5);
			expect(letters.length).toBeLessThanOrEqual(6);
			expect([...shuffledLetters].sort()).toEqual([...letters].sort());
			expect(crossword.words.some(({ word }) => word.name.length === 3)).toBe(
				true,
			);
			for (const placement of crossword.words) {
				expect(MINI_WORDS).toContain(placement.word.name);
				expect(placement.word.name.length).toBeGreaterThanOrEqual(3);
				expect(placement.word.name.length).toBeLessThanOrEqual(5);
				expect(
					[...normalizeWord(placement.word.name)].every((letter) =>
						letters.includes(letter),
					),
				).toBe(true);
				expect(
					crossword.grid
						.flat()
						.some(
							(cell) =>
								cell?.wordIds.includes(placement.id) && cell.wordIds.length > 1,
						),
				).toBe(true);
				seenWords.add(placement.word.name);
			}
			boards.add(JSON.stringify(crossword));
		}
		expect(seenWords.size).toBeGreaterThan(70);
		expect(boards.size).toBeGreaterThan(350);
	});

	it("is reproducible for a given day", () => {
		expect(generateMiniCrossword("2026-09-26")).toEqual(
			generateMiniCrossword("2026-09-26"),
		);
	});

	it("reveals only unseen cells without a hint cap and keeps regular hints capped", async () => {
		const { publicSnapshot: puzzle } = await fixture();
		let progress = createEmptyProgressState(puzzle);
		let regular = createEmptyProgressState(puzzle);
		const firstWord = generateMiniCrossword(puzzle.dateKey).crossword.words[0]
			.word.name;
		const guess = await resolveGuess({ puzzle, progress, guess: firstWord });
		progress = applyMiniEvent(
			puzzle,
			progress,
			createPuzzleEvent("guess_added", {
				guessHash: guess.guessHash,
				matchedWordId: guess.matchedSlotId,
				unlockToken: guess.unlockToken,
			}),
		);
		const wordCells = buildRevealedCells(puzzle, progress);
		let key = getRandomHintCellKey(puzzle, wordCells);
		while (key) {
			expect(wordCells.has(key)).toBe(false);
			const event = createPuzzleEvent("hint_used", { cellKey: key });
			const previous = progress.hintedCells.length;
			progress = applyMiniEvent(puzzle, progress, event);
			expect(progress.hintedCells).toHaveLength(previous + 1);
			expect(applyMiniEvent(puzzle, progress, event)).toBe(progress);
			regular = applyPuzzleEvent(regular, event, 5);
			key = getRandomHintCellKey(puzzle, buildRevealedCells(puzzle, progress));
		}
		expect(progress.hintsUsed).toBeGreaterThan(3);
		expect(regular.hintsUsed).toBe(3);
		expect(Object.keys(await decodeHintLetters(puzzle, progress))).toHaveLength(
			progress.hintsUsed,
		);
		expect(progress.completedAt).toBeNull();
	});

	it("accepts accent-free guesses and completes after exactly five answers", async () => {
		const { publicSnapshot: puzzle, privateSnapshot } = await fixture();
		let progress = createEmptyProgressState(puzzle);
		for (const word of privateSnapshot.wordSlots) {
			const guess = await resolveGuess({
				puzzle,
				progress,
				guess: normalizeWord(word.displayWord),
			});
			expect(guess.kind).toBe("new_word");
			progress = applyMiniEvent(
				puzzle,
				progress,
				createPuzzleEvent("guess_added", {
					guessHash: guess.guessHash,
					matchedWordId: guess.matchedSlotId,
					unlockToken: guess.unlockToken,
				}),
			);
		}
		expect(progress.guessedWordIds).toHaveLength(5);
		expect(progress.completedAt).not.toBeNull();
		expect(mergeMiniProgress(progress, progress).guessCount).toBe(5);
	});

	it("finds a word that crossing words and a hint spelled, without adding a try", async () => {
		const { publicSnapshot: puzzle, privateSnapshot } = await fixture();
		const slotOf = (word: string) => {
			const id = privateSnapshot.wordSlots.find(
				({ displayWord }) => displayWord === word,
			)?.id;
			const slot = puzzle.wordSlots.find((item) => item.id === id);
			if (!slot) throw new Error(`Missing ${word} in the Mini fixture`);
			return slot;
		};
		const revealedWords = async (state: typeof progress) =>
			findFullyRevealedWords(
				puzzle,
				state.guessedWordIds,
				buildCellLetters(
					puzzle.wordSlots,
					await decodeRevealedAnswers(puzzle, state),
					await decodeHintLetters(puzzle, state),
				),
			);
		// "oca" crosses "coco" and "bola" on its first and last letters.
		const oca = slotOf("oca");
		let progress = createEmptyProgressState(puzzle);
		for (const word of ["coco", "bola"]) {
			const guess = await resolveGuess({ puzzle, progress, guess: word });
			progress = applyMiniEvent(
				puzzle,
				progress,
				createPuzzleEvent("guess_added", {
					guessHash: guess.guessHash,
					matchedWordId: guess.matchedSlotId,
					unlockToken: guess.unlockToken,
				}),
			);
		}
		expect(await revealedWords(progress)).toEqual([]);

		progress = applyMiniEvent(
			puzzle,
			progress,
			createPuzzleEvent("hint_used", { cellKey: getSlotCellKey(oca, 1) }),
		);
		const words = await revealedWords(progress);
		const typed = await resolveGuess({ puzzle, progress, guess: "oca" });
		expect(words).toEqual([{ wordId: oca.id, unlockToken: typed.unlockToken }]);

		const event = createWordsRevealedEvent(words);
		const found = applyMiniEvent(puzzle, progress, event);
		expect(found.guessedWordIds).toEqual([...progress.guessedWordIds, oca.id]);
		expect(found.guessCount).toBe(2);
		expect(found.completedAt).toBeNull();
		expect(applyMiniEvent(puzzle, found, event)).toBe(found);
		expect(await decodeRevealedAnswers(puzzle, found)).toMatchObject({
			[oca.id]: "oca",
		});
		expect(await revealedWords(found)).toEqual([]);
		expect(
			(await resolveGuess({ puzzle, progress: found, guess: "oca" })).kind,
		).toBe("already_found");
	});

	it("ignores a full row of letters that is not the answer", async () => {
		const { publicSnapshot: puzzle } = await fixture();
		const slot = puzzle.wordSlots[0];
		const cells = new Map(
			Array.from({ length: slot.length }, (_, index) => [
				getSlotCellKey(slot, index),
				"x",
			]),
		);
		expect(await findFullyRevealedWords(puzzle, [], cells)).toEqual([]);
	});
});
