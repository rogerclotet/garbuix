import type { PuzzleBoard } from "./daily-grid";
import { getSlotCellKey } from "./daily-helpers";

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
};

export const INITIAL_TUTORIAL_STATE: TutorialState = {
	guess: "",
	foundWordIds: [],
	clueWordIds: [],
	message: "",
};

export function getTutorialStep(state: TutorialState) {
	if (state.foundWordIds.length === TUTORIAL_WORDS.length) return "complete";
	if (!state.foundWordIds.includes(0))
		return state.guess === "casa" ? "submit" : "spell";
	if (state.clueWordIds.length === 0) return "clue";
	return "finish";
}

type TutorialAction =
	| { type: "letter"; letter: string }
	| { type: "backspace" }
	| { type: "submit" }
	| { type: "clue" };

export function tutorialReducer(
	state: TutorialState,
	action: TutorialAction,
): TutorialState {
	const step = getTutorialStep(state);
	if (step === "complete") return state;
	switch (action.type) {
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
					...state,
					guess: "",
					message:
						"Aquesta paraula no és al tutorial. Prova'n una altra o demana una pista.",
				};
			if (state.foundWordIds.includes(word.id))
				return {
					...state,
					guess: "",
					message: "Aquesta ja l'has trobada. Busca'n una altra!",
				};
			return {
				...state,
				guess: "",
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
