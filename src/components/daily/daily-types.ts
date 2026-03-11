import type {
	DailyPuzzlePublic,
	PuzzleProgressState,
	SessionUser,
} from "@/lib/puzzle-types";

export type DailySessionUser = SessionUser;

export type DailyData = {
	puzzle: DailyPuzzlePublic;
	progress: PuzzleProgressState | null;
	rolloverAt: string;
	sessionUser: DailySessionUser;
};
