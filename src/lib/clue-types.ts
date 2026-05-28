// Shared (isomorphic) types for the AI clue review feature. Kept out of the
// `.server` modules so client components can import them without dragging
// server-only code (db, auth) into the browser bundle.

export type HintModelName = "sonnet" | "haiku";

export type ClueReviewChoice = "a" | "b" | "tie";

export type ClueReviewItem = {
	clueId: string;
	displayWord: string;
	areatematica: string;
	clueA: string;
	clueB: string;
	modelA: HintModelName;
	modelB: HintModelName;
	currentChoice: ClueReviewChoice | null;
};

export type CluesForReview = {
	dateKey: string;
	hasPuzzle: boolean;
	items: ClueReviewItem[];
};

export type ModelRatingCounts = { win: number; loss: number; tie: number };

export type ModelRatingSummary = {
	dateKey: string;
	perModel: Record<HintModelName, ModelRatingCounts>;
};
