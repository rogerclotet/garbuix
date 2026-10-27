import type { PuzzleSubmitFeedbackKind } from "@/components/puzzle/puzzle-types";
import { formatGuess } from "@/lib/puzzle-text";
import {
	getRemainingBoard,
	getWordFromPath,
	type QuadratBoardState,
	summarizeQuadratPaths,
} from "@/lib/quadrat-board";
import { QUADRAT_MIN_WORD_LENGTH } from "@/lib/quadrat-types";

type TutorialWord = { id: number; answer: string; path: number[] };

// Cells are numbered row by row:
//   S O P A
//   C R L U
//   A T A M
//   S A R E
export const TUTORIAL_LETTERS = [..."sopacrluatamsare"];

// Found before the tutorial starts, so the board looks like a day with two
// words left.
const PREFOUND_WORDS: TutorialWord[] = [
	{ id: 0, answer: "sopa", path: [0, 1, 2, 3] },
	{ id: 1, answer: "casa", path: [4, 8, 12, 13] },
	{ id: 2, answer: "mare", path: [11, 10, 14, 15] },
];
// PORTA and TAULA share their T and A. Finding PORTA takes those two counts
// from 2 to 1 and leaves TAULA as the only line on the board.
export const TUTORIAL_GUIDED_WORD: TutorialWord = {
	id: 3,
	answer: "porta",
	path: [2, 1, 5, 9, 10],
};
export const TUTORIAL_LAST_WORD: TutorialWord = {
	id: 4,
	answer: "taula",
	path: [9, 10, 7, 6, 3],
};
export const TUTORIAL_WORDS = [
	...PREFOUND_WORDS,
	TUTORIAL_GUIDED_WORD,
	TUTORIAL_LAST_WORD,
];

// Dictionary words a drag can spell along the tutorial's lines. A test keeps
// this in step with the guess dictionary.
export const TUTORIAL_VALID_GUESSES = ["aula", "port", "taul", "trop"];

export const TUTORIAL_BOARD = summarizeQuadratPaths(
	TUTORIAL_WORDS.map(({ path }) => path),
);

export type QuadratTutorialStep = "drag" | "follow" | "complete";

export type QuadratTutorialState = {
	foundWordIds: number[];
	guessCount: number;
	message: string;
};

export const INITIAL_QUADRAT_TUTORIAL_STATE: QuadratTutorialState = {
	foundWordIds: PREFOUND_WORDS.map(({ id }) => id),
	guessCount: PREFOUND_WORDS.length,
	message: "",
};

export function getQuadratTutorialStep(
	state: QuadratTutorialState,
): QuadratTutorialStep {
	if (!state.foundWordIds.includes(TUTORIAL_GUIDED_WORD.id)) return "drag";
	if (!state.foundWordIds.includes(TUTORIAL_LAST_WORD.id)) return "follow";
	return "complete";
}

export function getTutorialBoardState(
	state: QuadratTutorialState,
): QuadratBoardState {
	return getRemainingBoard(
		TUTORIAL_BOARD,
		TUTORIAL_WORDS.filter(({ id }) => state.foundWordIds.includes(id)).map(
			({ path }) => path,
		),
	);
}

export type QuadratTutorialRelease = {
	state: QuadratTutorialState;
	// The verdict for the panel above the board, as the daily board shows it.
	feedback: { word: string; kind: PuzzleSubmitFeedbackKind } | null;
	// Set when the drag found a word, to light it on the board.
	foundPath: number[] | null;
};

function letterName(cell: number | undefined): string {
	return (TUTORIAL_LETTERS[cell ?? -1] ?? "").toUpperCase();
}

function startsWith(path: readonly number[], prefix: readonly number[]) {
	return prefix.every((cell, index) => path[index] === cell);
}

function sameCells(left: readonly number[], right: readonly number[]) {
	return (
		left.length === right.length &&
		left.every((cell, index) => right[index] === cell)
	);
}

// What the tutorial makes of a drag the player let go of.
export function releaseTutorialPath(
	state: QuadratTutorialState,
	path: readonly number[],
): QuadratTutorialRelease {
	const step = getQuadratTutorialStep(state);
	if (step === "complete" || path.length === 0)
		return { state, feedback: null, foundPath: null };

	const target = step === "drag" ? TUTORIAL_GUIDED_WORD : TUTORIAL_LAST_WORD;
	const hint =
		step === "drag"
			? `Segueix les lletres marcades, de la ${letterName(target.path[0])} a la ${letterName(target.path.at(-1))}.`
			: "Segueix les línies que queden, d'una punta a l'altra.";
	const keepGoing = `Gairebé! Continua fins a la ${letterName(target.path.at(-1))} sense aixecar el dit.`;
	const withMessage = (message: string) => ({
		state: { ...state, message },
		feedback: null,
		foundPath: null,
	});

	// A tap is not a guess, but it is the usual first try at this board.
	if (path.length === 1)
		return withMessage(
			step === "drag"
				? `Toca la ${letterName(target.path[0])} i, sense aixecar el dit, arrossega'l fins a la ${letterName(target.path[1])}.`
				: "Sense aixecar el dit, arrossega'l d'una lletra a la següent.",
		);

	// A drag shorter than a word is not a guess either, as on the daily board.
	const isPartOfTarget = startsWith(target.path, path);
	if (path.length < QUADRAT_MIN_WORD_LENGTH)
		return withMessage(
			isPartOfTarget
				? keepGoing
				: `Les paraules tenen com a mínim ${QUADRAT_MIN_WORD_LENGTH} lletres. ${hint}`,
		);

	const word = getWordFromPath(TUTORIAL_LETTERS, path);
	const shown = formatGuess(word);

	// Past the minimum length every drag counts as an attempt, as on the
	// daily board.
	const guessCount = state.guessCount + 1;
	const isWord = TUTORIAL_VALID_GUESSES.includes(word);
	const missed = (kind: PuzzleSubmitFeedbackKind, message: string) => ({
		state: { ...state, guessCount, message },
		feedback: { word: shown, kind },
		foundPath: null,
	});

	if (word === target.answer)
		return {
			state: {
				foundWordIds: [...state.foundWordIds, target.id],
				guessCount,
				message: `${word.toUpperCase()}, encertada!`,
			},
			feedback: { word: shown, kind: "new_word" },
			foundPath: [...path],
		};
	if (isPartOfTarget)
		return missed(
			isWord ? "valid_but_not_in_puzzle" : "not_in_dictionary",
			keepGoing,
		);
	if (sameCells([...path].reverse(), target.path))
		return missed("not_in_dictionary", "Al revés! Comença per l'altra punta.");
	if (word === TUTORIAL_LAST_WORD.answer)
		return missed(
			"valid_but_not_in_puzzle",
			`${word.toUpperCase()} també hi és, però primer fem ${target.answer.toUpperCase()}. ${hint}`,
		);
	return isWord
		? missed(
				"valid_but_not_in_puzzle",
				`${word.toUpperCase()} existeix, però no és al tutorial. ${hint}`,
			)
		: missed("not_in_dictionary", `Aquesta paraula no existeix. ${hint}`);
}
