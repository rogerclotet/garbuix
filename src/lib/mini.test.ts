import { describe, expect, it } from "vitest";
import {
	buildRevealedCells,
	getRandomHintCellKey,
} from "@/components/daily/daily-helpers";
import { MINI_WORDS } from "@/data/mini-words";
import { generateMiniCrossword } from "@/lib/mini-generator";
import { applyMiniEvent, mergeMiniProgress } from "@/lib/mini-progress";
import {
	createPuzzleEvent,
	decodeHintLetters,
	resolveGuess,
} from "@/lib/puzzle-client";
import { addDaysToDateKey } from "@/lib/puzzle-dates";
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
		availableWordCount: 5,
	});
}

describe("Mini puzzles", () => {
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
});
