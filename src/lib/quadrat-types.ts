export const QUADRAT_SIZE = 4;
export const QUADRAT_CELL_COUNT = QUADRAT_SIZE * QUADRAT_SIZE;
export const QUADRAT_WORD_COUNT = 15;
export const QUADRAT_MIN_WORD_LENGTH = 4;

// Cells are numbered 0-15, row by row.
export type QuadratConnection = {
	cells: [number, number];
	// How many of the day's words step between these two cells, in either
	// direction.
	uses: number;
};

export type QuadratWordSlot = {
	id: number;
	length: number;
	// The same salted check and answer capsule as the crossword games.
	slotSalt: string;
	answerHash: string;
	answerCapsule: string;
	// The word's first two cells, opened when the player asks for its clue.
	// Like the crossword hint capsules, the salt is public: this keeps the
	// answer out of plain sight, it does not lock it.
	startSalt: string;
	startCapsule: string;
};

export type QuadratPuzzlePublic = {
	id: string;
	dateKey: string;
	seed: number;
	algorithmVersion: string;
	// Normalized letters without accents, row by row.
	letters: string[];
	// How many of the day's words pass through each cell.
	cellUses: number[];
	connections: QuadratConnection[];
	// Dictionary words that can be traced along the connections and are not
	// among the day's words. They count as valid guesses but find nothing.
	validNormalizedGuesses: string[];
	wordSlots: QuadratWordSlot[];
};

export type QuadratPuzzlePrivateWord = {
	id: number;
	displayWord: string;
	normalizedWord: string;
	path: number[];
};

export type QuadratPuzzlePrivate = {
	id: string;
	dateKey: string;
	seed: number;
	letters: string[];
	words: QuadratPuzzlePrivateWord[];
};
