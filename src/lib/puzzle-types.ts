export type PuzzleDirection = "horizontal" | "vertical";

export type SessionUser = {
	id: string;
	name: string;
	email: string;
	image?: string | null;
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

export type PuzzleProgressState = {
	puzzleId: string;
	guessHashes: string[];
	guessedWordIds: number[];
	revealedWordTokens: Record<string, string>;
	hintedCells: string[];
	hintsUsed: number;
	guessCount: number;
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
