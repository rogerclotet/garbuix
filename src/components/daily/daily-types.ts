import type {
	DailyPuzzlePublic,
	HistorySummaryEntry,
	PuzzleProgressState,
	SessionUser,
} from "@/lib/puzzle-types";

export type DailySessionUser = SessionUser;

export type DailyData = {
	historyEntries: HistorySummaryEntry[] | null;
	puzzle: DailyPuzzlePublic;
	progress: PuzzleProgressState | null;
	rolloverAt: string;
	sessionUser: DailySessionUser;
};
