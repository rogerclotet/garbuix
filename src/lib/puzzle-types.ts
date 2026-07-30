import type { PuzzleDifficulty } from "@/lib/puzzle-difficulty";

export type PuzzleDirection = "horizontal" | "vertical";

export type SessionUser = {
	id: string;
	name: string;
	displayName?: string | null;
	email: string;
	image?: string | null;
	googleImage?: string | null;
	useGoogleAvatar?: boolean;
} | null;

export type PuzzleGridMaskCell = {
	wordIds: number[];
};

export type DailyPuzzleWordSlot = {
	id: number;
	startRow: number;
	startCol: number;
	direction: PuzzleDirection;
	length: number;
	middleDotAfterIndices?: number[];
	slotSalt: string;
	answerHash: string;
	answerCapsule: string;
};

export type DailyPuzzleHintCapsule = {
	cellKey: string;
	hintSalt: string;
	hintCapsule: string;
};

export type DailyPuzzlePublic = {
	id: string;
	dateKey: string;
	seed: number;
	algorithmVersion: string;
	rows: number;
	cols: number;
	gridMask: (PuzzleGridMaskCell | null)[][];
	letters: string[];
	initialShuffledLetters: string[];
	validNormalizedGuesses: string[];
	wordSlots: DailyPuzzleWordSlot[];
	hintCapsules: DailyPuzzleHintCapsule[];
	// 1-3 star difficulty derived from the puzzle's word frequencies. Optional
	// for puzzles generated before the feature existed (filled by backfill).
	difficulty?: PuzzleDifficulty | null;
};

export type DailyPuzzlePrivateWord = {
	id: number;
	displayWord: string;
	normalizedWord: string;
	startRow: number;
	startCol: number;
	direction: PuzzleDirection;
};

export type DailyPuzzlePrivate = {
	id: string;
	dateKey: string;
	seed: number;
	rows: number;
	cols: number;
	gridLetters: (string | null)[][];
	letters: string[];
	wordSlots: DailyPuzzlePrivateWord[];
};

export type DailyPuzzlePreview = {
	rows: number;
	cols: number;
	gridLetters: (string | null)[][];
};

// Valid off-puzzle words needed to earn one free bonus letter reveal.
export const WORDS_PER_BONUS_CLUE = 5;

export type PuzzleProgressState = {
	puzzleId: string;
	guessHashes: string[];
	guessedWordIds: number[];
	revealedWordTokens: Record<string, string>;
	hintedCells: string[];
	clueWordIds: number[];
	hintsUsed: number;
	guessCount: number;
	// Valid dictionary words the player found that aren't part of the puzzle.
	// Every 5th such word grants a free bonus clue (see bonus_clue_revealed).
	bonusWordsFound: number;
	shuffledLetters: string[];
	completedAt: string | null;
	lastSyncedAt: string | null;
};

export type GuessAddedEvent = {
	id: string;
	at: string;
	type: "guess_added";
	payload: {
		guessHash: string;
		matchedWordId: number | null;
		unlockToken: string | null;
		// True when the guess is a valid dictionary word that isn't in the puzzle.
		// Drives the bonusWordsFound counter. Optional for backward compatibility
		// with events recorded before the bonus-clue feature existed.
		validNotInPuzzle?: boolean;
	};
};

export type HintUsedEvent = {
	id: string;
	at: string;
	type: "hint_used";
	payload: {
		cellKey: string;
	};
};

export type TextHintRequestedEvent = {
	id: string;
	at: string;
	type: "text_hint_requested";
	payload: {
		wordId: number;
	};
};

export type TextHintFallbackEvent = {
	id: string;
	at: string;
	type: "text_hint_fallback";
	payload: {
		wordId: number;
		cellKey: string;
	};
};

export type BonusClueRevealedEvent = {
	id: string;
	at: string;
	type: "bonus_clue_revealed";
	payload: {
		cellKey: string;
	};
};

export type LettersShuffledEvent = {
	id: string;
	at: string;
	type: "letters_shuffled";
	payload: {
		shuffledLetters: string[];
	};
};

export type ProgressResetEvent = {
	id: string;
	at: string;
	type: "progress_reset";
	payload: Record<string, never>;
};

export type PuzzleClientEvent =
	| GuessAddedEvent
	| HintUsedEvent
	| TextHintRequestedEvent
	| TextHintFallbackEvent
	| BonusClueRevealedEvent
	| LettersShuffledEvent
	| ProgressResetEvent;

export type HistorySummaryEntry = {
	dateKey: string;
	seed: number | null;
	totalWords: number;
	guessedWords: number;
	guessCount: number;
	hintsUsed: number;
	completed: boolean;
	lastUpdated: string;
	legacy?: boolean;
	// Puzzle-level difficulty (same for every player on a given day). Absent for
	// legacy/anonymous entries that have no linked puzzle row.
	difficulty?: PuzzleDifficulty | null;
};

// Number of history entries fetched/rendered per page. Keeps the initial page
// load light now that accounts can accumulate hundreds of daily results.
export const HISTORY_PAGE_SIZE = 5;

export type HistoryStats = {
	totalDays: number;
	completedDays: number;
	completionRate: number;
	currentStreak: number;
	bestStreak: number;
	avgGuesses: number;
};

export type HistoryEntriesPage = {
	entries: HistorySummaryEntry[];
	hasMore: boolean;
};

export type AnonymousImportPayload = {
	historyEntries: HistorySummaryEntry[];
	activeProgressByDate: Record<string, PuzzleProgressState>;
};

export type AccountPuzzleCache = {
	puzzleId: string;
	baseProgress: PuzzleProgressState | null;
	queuedEvents: PuzzleClientEvent[];
};
