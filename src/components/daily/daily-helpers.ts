import { getPlayableWordLetters, normalizeWord } from "@/lib/puzzle-text";
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

// All grid cell keys covered by a word slot, used to highlight a word on the
// grid (AI-clue ring and tap-to-locate flash).
export function getWordCellKeys(slot: DailyPuzzleWordSlot): Set<string> {
	const keys = new Set<string>();
	for (let index = 0; index < slot.length; index += 1) {
		keys.add(getSlotCellKey(slot, index));
	}

	return keys;
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
		const displayLetters = getPlayableWordLetters(answer);

		for (let index = 0; index < displayLetters.length; index += 1) {
			letters.set(getSlotCellKey(slot, index), displayLetters[index] ?? "");
		}
	}

	for (const [cellKey, letter] of Object.entries(hintLetters)) {
		if (!letters.has(cellKey)) {
			letters.set(cellKey, letter);
		}
	}

	return letters;
}

export function getNextHintCellKey(
	puzzle: DailyPuzzlePublic,
	revealedCells: Set<string>,
) {
	return (
		puzzle.hintCapsules.find((capsule) => !revealedCells.has(capsule.cellKey))
			?.cellKey ?? null
	);
}

// Deterministic hint cell for a word slot, used as the silent fallback when a
// word's AI clue is unavailable. Only hint-capsule cells decode into letters, so
// we return the slot's first capsule cell (stable per word, regardless of what
// is already revealed) and null when the word has no capsule cell. Picking a
// fixed cell keeps the fallback idempotent across reloads and gives each word
// its own letter instead of latching onto a cell revealed for a crossing word.
export function getSlotHintCellKey(
	puzzle: DailyPuzzlePublic,
	slot: DailyPuzzleWordSlot,
) {
	const slotCellKeys = new Set<string>();
	for (let index = 0; index < slot.length; index += 1) {
		slotCellKeys.add(getSlotCellKey(slot, index));
	}

	return (
		puzzle.hintCapsules.find((item) => slotCellKeys.has(item.cellKey))
			?.cellKey ?? null
	);
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

function injectMiddleDots(word: string, middleDotAfterIndices: number[] = []) {
	if (middleDotAfterIndices.length === 0) {
		return word;
	}

	const indices = new Set(middleDotAfterIndices);
	let decoratedWord = "";

	for (let index = 0; index < word.length; index += 1) {
		decoratedWord += word[index] ?? "";
		if (indices.has(index)) {
			decoratedWord += "·";
		}
	}

	return decoratedWord;
}

export function getDisplayedSlotWord(
	slot: DailyPuzzleWordSlot,
	cellLetters: Map<string, string>,
) {
	const letters = Array.from({ length: slot.length }, (_, index) => {
		return cellLetters.get(getSlotCellKey(slot, index))?.toUpperCase() ?? "_";
	}).join("");

	return injectMiddleDots(letters, slot.middleDotAfterIndices);
}

function countDisplayedSlotLetters(
	slot: DailyPuzzleWordSlot,
	cellLetters: Map<string, string>,
) {
	let revealedLetterCount = 0;

	for (let index = 0; index < slot.length; index += 1) {
		if (cellLetters.get(getSlotCellKey(slot, index))) {
			revealedLetterCount += 1;
		}
	}

	return revealedLetterCount;
}

export function getSortedWordSlots(
	wordSlots: DailyPuzzleWordSlot[],
	guessedWordIds: number[],
	cellLetters: Map<string, string>,
) {
	const guessedWordOrder = new Map(
		guessedWordIds.map((wordId, index) => [wordId, index]),
	);
	const foundSlots: DailyPuzzleWordSlot[] = [];
	const notFoundSlots: DailyPuzzleWordSlot[] = [];

	for (const slot of wordSlots) {
		if (guessedWordOrder.has(slot.id)) {
			foundSlots.push(slot);
			continue;
		}

		notFoundSlots.push(slot);
	}

	foundSlots.sort(
		(a, b) =>
			(guessedWordOrder.get(b.id) ?? -1) - (guessedWordOrder.get(a.id) ?? -1),
	);
	notFoundSlots.sort((a, b) => {
		const aRevealedLetterCount = countDisplayedSlotLetters(a, cellLetters);
		const bRevealedLetterCount = countDisplayedSlotLetters(b, cellLetters);
		if (aRevealedLetterCount !== bRevealedLetterCount) {
			return bRevealedLetterCount - aRevealedLetterCount;
		}

		if (a.length !== b.length) {
			return a.length - b.length;
		}

		return a.id - b.id;
	});

	return {
		foundSlots,
		notFoundSlots,
	};
}
