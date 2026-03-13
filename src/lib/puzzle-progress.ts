import type {
	DailyPuzzlePublic,
	PuzzleClientEvent,
	PuzzleProgressState,
} from "@/lib/puzzle-types";

export function createEmptyProgressState(
	puzzle: Pick<DailyPuzzlePublic, "id" | "initialShuffledLetters">,
): PuzzleProgressState {
	return {
		puzzleId: puzzle.id,
		guessHashes: [],
		guessedWordIds: [],
		revealedWordTokens: {},
		hintedCells: [],
		hintsUsed: 0,
		guessCount: 0,
		shuffledLetters: [...puzzle.initialShuffledLetters],
		completedAt: null,
		lastSyncedAt: null,
	};
}

export function applyPuzzleEvent(
	state: PuzzleProgressState,
	event: PuzzleClientEvent,
	totalWords: number,
): PuzzleProgressState {
	switch (event.type) {
		case "guess_added": {
			if (state.guessHashes.includes(event.payload.guessHash)) {
				return state;
			}

			const guessHashes = [...state.guessHashes, event.payload.guessHash];
			const guessedWordIds =
				event.payload.matchedWordId == null ||
				state.guessedWordIds.includes(event.payload.matchedWordId)
					? state.guessedWordIds
					: [...state.guessedWordIds, event.payload.matchedWordId];

			const revealedWordTokens =
				event.payload.matchedWordId == null || event.payload.unlockToken == null
					? state.revealedWordTokens
					: {
							...state.revealedWordTokens,
							[String(event.payload.matchedWordId)]: event.payload.unlockToken,
						};

			const isComplete =
				totalWords > 0 && guessedWordIds.length >= totalWords
					? (state.completedAt ?? event.at)
					: state.completedAt;

			return {
				...state,
				guessHashes,
				guessCount: guessHashes.length,
				guessedWordIds,
				revealedWordTokens,
				completedAt: isComplete,
			};
		}
		case "hint_used": {
			if (
				state.hintsUsed >= 3 ||
				state.hintedCells.includes(event.payload.cellKey)
			) {
				return state;
			}

			return {
				...state,
				hintedCells: [...state.hintedCells, event.payload.cellKey],
				hintsUsed: state.hintsUsed + 1,
			};
		}
		case "letters_shuffled": {
			return {
				...state,
				shuffledLetters: [...event.payload.shuffledLetters],
			};
		}
		case "progress_reset": {
			return {
				...state,
				guessHashes: [],
				guessedWordIds: [],
				revealedWordTokens: {},
				hintedCells: [],
				hintsUsed: 0,
				guessCount: 0,
				completedAt: null,
			};
		}
	}
}

export function applyPuzzleEvents(
	initialState: PuzzleProgressState,
	events: PuzzleClientEvent[],
	totalWords: number,
) {
	return events.reduce(
		(state, event) => applyPuzzleEvent(state, event, totalWords),
		initialState,
	);
}

export function sortPuzzleEvents(events: PuzzleClientEvent[]) {
	return [...events].sort((left, right) => {
		const timestampDelta =
			new Date(left.at).getTime() - new Date(right.at).getTime();
		if (timestampDelta !== 0) {
			return timestampDelta;
		}

		return left.id.localeCompare(right.id);
	});
}

export function applyPuzzleEventsChronologically(
	initialState: PuzzleProgressState,
	events: PuzzleClientEvent[],
	totalWords: number,
) {
	return applyPuzzleEvents(initialState, sortPuzzleEvents(events), totalWords);
}
