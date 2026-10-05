import { describe, expect, it } from "vitest";
import dictionary from "@/data/catalan-syllables.json";
import { SYLLABLE_WORDS } from "@/data/syllable-words";
import {
	createPuzzleEvent,
	decodeHintLetters,
	decodeRevealedAnswers,
	resolveFoundWords,
} from "@/lib/puzzle-client";
import { addDaysToDateKey } from "@/lib/puzzle-dates";
import {
	buildCellLetters,
	buildRevealedCells,
	getSlotCellKey,
} from "@/lib/puzzle-helpers";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import { normalizeWord } from "@/lib/puzzle-text";
import { resolveSyllableGuess } from "@/lib/syllable-client";
import { getSyllableDictionary } from "@/lib/syllable-dictionary.server";
import {
	generateSyllableCrossword,
	getSyllableCells,
} from "@/lib/syllable-generator";
import { applySyllableEvent } from "@/lib/syllable-progress";
import { syllableFixture } from "@/test/syllable-fixture";

describe("syllable puzzles", () => {
	it("generates a connected five-word crossword using exactly six syllables throughout a year", () => {
		const boards = new Set<string>();
		for (let day = 0; day < 365; day++) {
			const generated = generateSyllableCrossword(
				addDaysToDateKey("2026-01-01", day),
			);
			const { crossword, letters, shuffledLetters } = generated;
			expect(crossword.words).toHaveLength(5);
			expect(letters).toHaveLength(6);
			expect([...shuffledLetters].sort()).toEqual(letters);
			expect(
				new Set(crossword.words.map(({ word }) => normalizeWord(word.name)))
					.size,
			).toBe(5);
			const connected = new Set([crossword.words[0].id]);
			for (let step = 0; step < 5; step++) {
				for (const cell of crossword.grid.flat()) {
					if (cell?.wordIds.some((id) => connected.has(id)))
						for (const id of cell.wordIds) connected.add(id);
				}
			}
			expect(connected.size).toBe(5);
			for (const placement of crossword.words) {
				const cells = getSyllableCells(placement.word);
				expect(SYLLABLE_WORDS).toContainEqual(cells);
				expect(cells.length).toBeGreaterThanOrEqual(2);
				expect(cells.length).toBeLessThanOrEqual(3);
				for (const [index, cell] of cells.entries()) {
					expect(letters).toContain(normalizeWord(cell));
					const [row, col] = getSlotCellKey(placement, index)
						.split(",")
						.map(Number);
					expect(crossword.grid[row][col]?.letter).toBe(cell);
				}
			}
			boards.add(JSON.stringify(crossword));
		}
		expect(boards.size).toBeGreaterThan(350);
		expect(generateSyllableCrossword("2026-10-05")).toEqual(
			generateSyllableCrossword("2026-10-05"),
		);
	});

	it.each([
		["coixí", ["coi", "xí"]],
		["guineu", ["gui", "neu"]],
		["ciència", ["ci", "èn", "ci", "a"]],
		["col·legi", ["col·", "le", "gi"]],
		["iogurt", ["io", "gurt"]],
		["pingüí", ["pin", "güí"]],
	])("uses Catalan syllable boundaries for %s", (word, syllables) => {
		expect(dictionary.find((entry) => entry.word === word)?.syllables).toEqual(
			syllables,
		);
	});

	it("accepts repetition and short extras but rejects the right letters with wrong boundaries", async () => {
		const fixture = await syllableFixture();
		const bank = ["co", "a", "i", "ai", "gua", "pa"];
		const puzzle = {
			...fixture.puzzle,
			letters: bank,
			...getSyllableDictionary(bank),
		};
		const progress = createEmptyProgressState(puzzle);
		for (const syllables of [["co", "co"], ["pa"], ["ai", "gua"]]) {
			expect(
				(await resolveSyllableGuess({ puzzle, progress, syllables })).kind,
			).toBe("valid_but_not_in_puzzle");
		}
		expect(
			(
				await resolveSyllableGuess({
					puzzle,
					progress,
					syllables: ["a", "i", "gua"],
				})
			).kind,
		).toBe("not_in_dictionary");
		expect(
			(
				await resolveSyllableGuess({
					puzzle,
					progress,
					syllables: ["co", "co", "co"],
				})
			).kind,
		).toBe("not_in_dictionary");
	});

	it("reveals whole syllables with unlimited hints and preserves accents on completing the board", async () => {
		const { puzzle, privateSnapshot, crossword } = await syllableFixture();
		let progress = createEmptyProgressState(puzzle);
		for (const { cellKey } of puzzle.hintCapsules) {
			const event = createPuzzleEvent("hint_used", { cellKey });
			progress = applySyllableEvent(puzzle, progress, event);
			expect(applySyllableEvent(puzzle, progress, event)).toBe(progress);
		}
		expect(progress.hintsUsed).toBeGreaterThan(3);
		expect(progress.completedAt).toBeNull();
		const hints = await decodeHintLetters(puzzle, progress);
		for (const [key, syllable] of Object.entries(hints)) {
			const [row, col] = key.split(",").map(Number);
			expect(syllable).toBe(privateSnapshot.gridLetters[row][col]);
		}
		const targetWords = new Set(
			crossword.words.map(({ word }) => normalizeWord(word.name)),
		);
		const extra = puzzle.validSyllableGuesses.find(
			(sequence) => !targetWords.has(sequence.replaceAll("|", "")),
		);
		expect(extra).toBeDefined();
		const bonus = await resolveSyllableGuess({
			puzzle,
			progress,
			syllables: (extra ?? "").split("|"),
		});
		const event = createPuzzleEvent("guess_added", {
			guessHash: bonus.guessHash,
			matchedWordId: null,
			unlockToken: null,
			validNotInPuzzle: true,
		});
		progress = applySyllableEvent(puzzle, progress, event);
		expect(applySyllableEvent(puzzle, progress, event)).toBe(progress);
		expect(progress.bonusWordsFound).toBe(1);
		for (const { word } of crossword.words) {
			const guess = await resolveSyllableGuess({
				puzzle,
				progress,
				syllables: getSyllableCells(word).map(normalizeWord),
			});
			expect(guess.kind).toBe("new_word");
			expect(guess.displayWord).toBe(word.name);
			progress = applySyllableEvent(
				puzzle,
				progress,
				createPuzzleEvent("guess_added", {
					guessHash: guess.guessHash,
					matchedWordId: guess.matchedSlotId,
					unlockToken: guess.unlockToken,
				}),
			);
		}
		expect(progress.completedAt).not.toBeNull();
		const answers = await decodeRevealedAnswers(puzzle, progress);
		expect(Object.values(answers)).toContain("català");
		const cells = buildCellLetters(puzzle.wordSlots, answers, {});
		expect(new Set(cells.keys())).toEqual(buildRevealedCells(puzzle, progress));
		for (const [key, value] of cells) {
			const [row, col] = key.split(",").map(Number);
			expect(value).toBe(privateSnapshot.gridLetters[row][col]);
		}
		const found = await resolveFoundWords({
			puzzle,
			guessHashes: progress.guessHashes,
			revealedAnswers: answers,
		});
		expect(found.filter((word) => !word.isInPuzzle)).toHaveLength(1);
		expect(
			applySyllableEvent(
				puzzle,
				progress,
				createPuzzleEvent("letters_shuffled", {
					shuffledLetters: [...puzzle.letters].reverse(),
				}),
			),
		).toBe(progress);
		expect(applySyllableEvent(puzzle, progress, event)).toBe(progress);
	});
});
