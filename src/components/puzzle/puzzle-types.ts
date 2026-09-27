export type PuzzleSubmitFeedbackKind =
	| "new_word"
	| "already_found"
	| "valid_but_not_in_puzzle"
	| "not_in_dictionary"
	| "invalid_input";

export type PuzzleSubmitFeedback = {
	id: number;
	word: string;
	kind: PuzzleSubmitFeedbackKind;
};
