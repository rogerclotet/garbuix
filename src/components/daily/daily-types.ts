import type {
	DailyPuzzlePublic,
	PuzzleProgressState,
} from "@/lib/puzzle-types";

export type DailySessionUser = {
	id: string;
	name: string;
	email: string;
	image?: string | null;
} | null;

export type DailyData = {
	puzzle: DailyPuzzlePublic;
	progress: PuzzleProgressState | null;
	rolloverAt: string;
	sessionUser: DailySessionUser;
};
