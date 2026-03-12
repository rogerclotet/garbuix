import { normalizeWord } from "@/lib/puzzle-text";
import type {
	DailyPuzzlePublic,
	DailyPuzzleWordSlot,
	PuzzleProgressState,
} from "@/lib/puzzle-types";

export function buildHistoryEntry(
	puzzle: DailyPuzzlePublic,
	progress: PuzzleProgressState,
) {
	return {
		dateKey: puzzle.dateKey,
		seed: puzzle.seed,
		totalWords: puzzle.wordSlots.length,
		guessedWords: progress.guessedWordIds.length,
		guessCount: progress.guessCount,
		hintsUsed: progress.hintsUsed,
		completed: progress.guessedWordIds.length >= puzzle.wordSlots.length,
		lastUpdated: new Date().toISOString(),
	};
}

export function getSlotCellKey(slot: DailyPuzzleWordSlot, index: number) {
	const row =
		slot.direction === "horizontal" ? slot.startRow : slot.startRow + index;
	const col =
		slot.direction === "horizontal" ? slot.startCol + index : slot.startCol;

	return `${row},${col}`;
}

export function buildRevealedCells(
	puzzle: DailyPuzzlePublic,
	progress: PuzzleProgressState,
) {
	const cells = new Set<string>(progress.hintedCells);

	for (const slot of puzzle.wordSlots) {
		if (!progress.guessedWordIds.includes(slot.id)) continue;

		for (let index = 0; index < slot.length; index += 1) {
			cells.add(getSlotCellKey(slot, index));
		}
	}

	return cells;
}

export function buildCellLetters(
	wordSlots: DailyPuzzlePublic["wordSlots"],
	revealedAnswers: Record<number, string>,
	hintLetters: Record<string, string>,
) {
	const letters = new Map<string, string>();

	for (const slot of wordSlots) {
		const answer = revealedAnswers[slot.id];
		if (!answer) continue;

		for (let index = 0; index < answer.length; index += 1) {
			letters.set(getSlotCellKey(slot, index), answer[index] ?? "");
		}
	}

	for (const [cellKey, letter] of Object.entries(hintLetters)) {
		if (!letters.has(cellKey)) {
			letters.set(cellKey, letter);
		}
	}

	return letters;
}

export type GuessKeyboardAction =
	| { type: "append_letter"; letter: string }
	| { type: "backspace" }
	| { type: "submit" };

export function getGuessKeyboardAction(
	key: string,
	availableLetters: string[],
	code?: string,
): GuessKeyboardAction | null {
	if (
		key === "Enter" ||
		key === " " ||
		key === "Spacebar" ||
		code === "Space"
	) {
		return { type: "submit" };
	}

	if (key === "Backspace" || key === "Delete") {
		return { type: "backspace" };
	}

	if (key.length !== 1) {
		return null;
	}

	const normalizedKey = normalizeWord(key);
	if (normalizedKey.length !== 1) {
		return null;
	}

	const matchedLetter = availableLetters.find(
		(letter) => normalizeWord(letter) === normalizedKey,
	);

	if (!matchedLetter) {
		return null;
	}

	return {
		type: "append_letter",
		letter: matchedLetter,
	};
}

export function getDisplayedSlotWord(
	slot: DailyPuzzleWordSlot,
	cellLetters: Map<string, string>,
) {
	return Array.from({ length: slot.length }, (_, index) => {
		return cellLetters.get(getSlotCellKey(slot, index))?.toUpperCase() ?? "_";
	}).join("");
}
