import type { PuzzleBoard } from "@/components/puzzle/puzzle-grid";
import type {
	PuzzleSubmitFeedback,
	PuzzleSubmitFeedbackKind,
} from "@/components/puzzle/puzzle-types";
import { getSlotCellKey } from "@/lib/puzzle-helpers";

export const TUTORIAL_LETTERS = ["r", "a", "t", "s", "c", "o"];

export const TUTORIAL_WORDS = [
	{
		id: 0,
		answer: "casa",
		clue: "L'edifici on vius.",
		startRow: 4,
		startCol: 2,
		direction: "horizontal",
	},
	{
		id: 1,
		answer: "costa",
		clue: "La part de la terra que toca el mar.",
		startRow: 0,
		startCol: 5,
		direction: "vertical",
	},
	{
		id: 2,
		answer: "carta",
		clue: "Un missatge escrit que pots enviar dins d'un sobre.",
		startRow: 0,
		startCol: 3,
		direction: "vertical",
	},
	{
		id: 3,
		answer: "rosa",
		clue: "Una flor amb espines a la tija.",
		startRow: 1,
		startCol: 0,
		direction: "horizontal",
	},
	{
		id: 4,
		answer: "tros",
		clue: "Una part d'una cosa, com una porció de pa.",
		startRow: 0,
		startCol: 0,
		direction: "vertical",
	},
] satisfies (Omit<PuzzleBoard["wordSlots"][number], "length"> & {
	answer: string;
	clue: string;
})[];

const wordSlots = TUTORIAL_WORDS.map((word) => ({
	...word,
	length: word.answer.length,
}));

export const TUTORIAL_BOARD: PuzzleBoard = {
	rows: 5,
	cols: 6,
	wordSlots,
	gridMask: Array.from({ length: 5 }, (_, row) =>
		Array.from({ length: 6 }, (_, col) => {
			const wordIds = wordSlots
				.filter((slot) =>
					Array.from({ length: slot.length }, (_, index) =>
						getSlotCellKey(slot, index),
					).includes(`${row},${col}`),
				)
				.map((slot) => slot.id);
			return wordIds.length > 0 ? { wordIds } : null;
		}),
	),
};

export type TutorialState = {
	guess: string;
	foundWordIds: number[];
	clueWordIds: number[];
	message: string;
	helpSent: boolean;
	guessCount: number;
	feedback: PuzzleSubmitFeedback | null;
};

export const INITIAL_TUTORIAL_STATE: TutorialState = {
	guess: "",
	foundWordIds: [],
	clueWordIds: [],
	message: "",
	helpSent: false,
	guessCount: 0,
	feedback: null,
};

// A checked guess counts as an attempt and flashes in the guess bar, the same
// way it does on the daily board.
function checkedGuess(
	state: TutorialState,
	kind: PuzzleSubmitFeedbackKind,
): TutorialState {
	const guessCount = state.guessCount + 1;
	return {
		...state,
		guess: "",
		guessCount,
		feedback: { id: guessCount, word: state.guess, kind },
	};
}

export function getTutorialStep(state: TutorialState) {
	if (state.foundWordIds.length === TUTORIAL_WORDS.length)
		return state.helpSent ? "complete" : "help";
	if (!state.foundWordIds.includes(0))
		return state.guess === "casa" ? "submit" : "spell";
	if (state.clueWordIds.length === 0) return "clue";
	return "finish";
}

type TutorialAction =
	| { type: "letter"; letter: string }
	| { type: "backspace" }
	| { type: "submit" }
	| { type: "clue" }
	| { type: "help_sent" };

export function tutorialReducer(
	state: TutorialState,
	action: TutorialAction,
): TutorialState {
	const step = getTutorialStep(state);
	if (step === "complete") return state;
	if (step === "help")
		return action.type === "help_sent" ? { ...state, helpSent: true } : state;
	switch (action.type) {
		case "help_sent":
			return state;
		case "letter": {
			if (step === "clue")
				return { ...state, message: "Prova primer el botó Pista." };
			if (!TUTORIAL_LETTERS.includes(action.letter) || state.guess.length >= 12)
				return state;
			if (step === "spell" || step === "submit") {
				const nextLetter = "casa"[state.guess.length];
				if (action.letter !== nextLetter)
					return {
						...state,
						message: nextLetter
							? `Ara toca la ${nextLetter.toUpperCase()}.`
							: "Ja tens CASA. Prem Comprovar.",
					};
			}
			return { ...state, guess: state.guess + action.letter, message: "" };
		}
		case "backspace":
			return { ...state, guess: state.guess.slice(0, -1), message: "" };
		case "submit": {
			if (state.guess.length < 4)
				return {
					...state,
					message: "Les paraules han de tenir com a mínim 4 lletres.",
				};
			const word = TUTORIAL_WORDS.find((word) => word.answer === state.guess);
			if (!word)
				return {
					...checkedGuess(state, "valid_but_not_in_puzzle"),
					message:
						"Aquesta paraula no és al tutorial. Prova'n una altra o demana una pista.",
				};
			if (state.foundWordIds.includes(word.id))
				return {
					...checkedGuess(state, "already_found"),
					message: "Aquesta ja l'has trobada. Busca'n una altra!",
				};
			return {
				...checkedGuess(state, "new_word"),
				foundWordIds: [...state.foundWordIds, word.id],
				message: `${word.answer.toUpperCase()}, encertada!`,
			};
		}
		case "clue": {
			if (step !== "clue" && step !== "finish") return state;
			if (state.clueWordIds.length >= 3) return state;
			const word = TUTORIAL_WORDS.find(
				(word) =>
					!state.foundWordIds.includes(word.id) &&
					!state.clueWordIds.includes(word.id),
			);
			return word
				? {
						...state,
						clueWordIds: [...state.clueWordIds, word.id],
						message: "Pista descoberta! La tens a la llista de paraules.",
					}
				: state;
		}
		default: {
			const exhaustive: never = action;
			return exhaustive;
		}
	}
}
