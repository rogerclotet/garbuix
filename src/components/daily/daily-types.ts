import type {
	DailyPuzzlePublic,
	HistorySummaryEntry,
	PuzzleProgressState,
	SessionUser,
} from "@/lib/puzzle-types";

export type DailySessionUser = SessionUser;

export type DailySubmitFeedbackKind =
	| "new_word"
	| "already_found"
	| "valid_but_not_in_puzzle"
	| "not_in_dictionary"
	| "invalid_input";

export type DailySubmitFeedback = {
	id: number;
	word: string;
	kind: DailySubmitFeedbackKind;
};

export type DailyData = {
	historyEntries: HistorySummaryEntry[] | null;
	puzzle: DailyPuzzlePublic;
	progress: PuzzleProgressState | null;
	rolloverAt: string;
	sessionUser: DailySessionUser;
};
