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
		clueWordIds: [],
		hintsUsed: 0,
		guessCount: 0,
		bonusWordsFound: 0,
		shuffledLetters: [...puzzle.initialShuffledLetters],
		completedAt: null,
		lastSyncedAt: null,
	};
}

export function getCompatibleProgress(
	progress: PuzzleProgressState | null | undefined,
	puzzle: Pick<DailyPuzzlePublic, "id">,
) {
	if (!progress || progress.puzzleId !== puzzle.id) {
		return null;
	}

	return progress;
}

function toTimestamp(value: string | null | undefined) {
	if (!value) {
		return Number.NEGATIVE_INFINITY;
	}

	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function pickPreferredProgressState(
	left: PuzzleProgressState | null | undefined,
	right: PuzzleProgressState | null | undefined,
) {
	if (!left) {
		return right ?? null;
	}

	if (!right) {
		return left;
	}

	const leftSyncedAt = toTimestamp(left.lastSyncedAt);
	const rightSyncedAt = toTimestamp(right.lastSyncedAt);
	if (leftSyncedAt !== rightSyncedAt) {
		return leftSyncedAt > rightSyncedAt ? left : right;
	}

	const leftCompletedAt = toTimestamp(left.completedAt);
	const rightCompletedAt = toTimestamp(right.completedAt);
	if (leftCompletedAt !== rightCompletedAt) {
		return leftCompletedAt > rightCompletedAt ? left : right;
	}

	if (left.guessedWordIds.length !== right.guessedWordIds.length) {
		return left.guessedWordIds.length > right.guessedWordIds.length
			? left
			: right;
	}

	if (left.guessCount !== right.guessCount) {
		return left.guessCount > right.guessCount ? left : right;
	}

	if (left.hintsUsed !== right.hintsUsed) {
		return left.hintsUsed > right.hintsUsed ? left : right;
	}

	if (left.bonusWordsFound !== right.bonusWordsFound) {
		return left.bonusWordsFound > right.bonusWordsFound ? left : right;
	}

	if (left.guessHashes.length !== right.guessHashes.length) {
		return left.guessHashes.length > right.guessHashes.length ? left : right;
	}

	return right;
}

export function isSameProgressState(
	left: PuzzleProgressState,
	right: PuzzleProgressState,
) {
	return (
		left.puzzleId === right.puzzleId &&
		left.guessCount === right.guessCount &&
		left.hintsUsed === right.hintsUsed &&
		left.bonusWordsFound === right.bonusWordsFound &&
		left.completedAt === right.completedAt &&
		JSON.stringify(left.guessHashes) === JSON.stringify(right.guessHashes) &&
		JSON.stringify(left.guessedWordIds) ===
			JSON.stringify(right.guessedWordIds) &&
		JSON.stringify(left.revealedWordTokens) ===
			JSON.stringify(right.revealedWordTokens) &&
		JSON.stringify(left.hintedCells) === JSON.stringify(right.hintedCells) &&
		JSON.stringify(left.clueWordIds) === JSON.stringify(right.clueWordIds) &&
		JSON.stringify(left.shuffledLetters) ===
			JSON.stringify(right.shuffledLetters)
	);
}

export function mergeProgressStates(
	existing: PuzzleProgressState | null,
	incoming: PuzzleProgressState,
): PuzzleProgressState {
	const guessHashes = Array.from(
		new Set([...(existing?.guessHashes ?? []), ...incoming.guessHashes]),
	);
	const guessedWordIds = Array.from(
		new Set([...(existing?.guessedWordIds ?? []), ...incoming.guessedWordIds]),
	);

	return {
		puzzleId: incoming.puzzleId,
		guessHashes,
		guessedWordIds,
		revealedWordTokens: {
			...(existing?.revealedWordTokens ?? {}),
			...incoming.revealedWordTokens,
		},
		hintedCells: Array.from(
			new Set([...(existing?.hintedCells ?? []), ...incoming.hintedCells]),
		),
		clueWordIds: Array.from(
			new Set([
				...(existing?.clueWordIds ?? []),
				...(incoming.clueWordIds ?? []),
			]),
		),
		hintsUsed: Math.max(existing?.hintsUsed ?? 0, incoming.hintsUsed),
		bonusWordsFound: Math.max(
			existing?.bonusWordsFound ?? 0,
			incoming.bonusWordsFound,
		),
		guessCount: guessHashes.length,
		shuffledLetters:
			incoming.shuffledLetters.length > 0
				? incoming.shuffledLetters
				: (existing?.shuffledLetters ?? []),
		completedAt: existing?.completedAt ?? incoming.completedAt,
		lastSyncedAt: incoming.lastSyncedAt,
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

			const bonusWordsFound =
				event.payload.validNotInPuzzle && event.payload.matchedWordId == null
					? state.bonusWordsFound + 1
					: state.bonusWordsFound;

			return {
				...state,
				guessHashes,
				guessCount: guessHashes.length,
				guessedWordIds,
				revealedWordTokens,
				bonusWordsFound,
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
		case "text_hint_requested": {
			if (
				state.hintsUsed >= 3 ||
				state.clueWordIds.includes(event.payload.wordId)
			) {
				return state;
			}

			return {
				...state,
				clueWordIds: [...state.clueWordIds, event.payload.wordId],
				hintsUsed: state.hintsUsed + 1,
			};
		}
		case "text_hint_fallback": {
			// Silent letter reveal when no AI clue is available. The hint was already
			// counted by the preceding text_hint_requested, so we only reveal the
			// letter here without touching hintsUsed. Idempotent on cellKey so a
			// reload (which refetches and finds the clue still missing) won't reveal
			// extra letters.
			if (state.hintedCells.includes(event.payload.cellKey)) {
				return state;
			}

			return {
				...state,
				hintedCells: [...state.hintedCells, event.payload.cellKey],
			};
		}
		case "bonus_clue_revealed": {
			// Free letter reveal earned every 10 valid off-puzzle words. Adds the
			// cell to hintedCells (so it decodes onto the grid) without touching the
			// 3-hint budget. Idempotent on cellKey so replays never reveal extras.
			if (state.hintedCells.includes(event.payload.cellKey)) {
				return state;
			}

			return {
				...state,
				hintedCells: [...state.hintedCells, event.payload.cellKey],
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
				clueWordIds: [],
				hintsUsed: 0,
				guessCount: 0,
				bonusWordsFound: 0,
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

export function buildSyncedProgressState(options: {
	existingProgress: PuzzleProgressState | null;
	initialProgress: PuzzleProgressState;
	incomingEvents: PuzzleClientEvent[];
	totalWords: number;
	historicalEvents?: PuzzleClientEvent[];
}) {
	const {
		existingProgress,
		historicalEvents = [],
		incomingEvents,
		initialProgress,
		totalWords,
	} = options;
	const baseProgress =
		existingProgress ??
		applyPuzzleEventsChronologically(
			initialProgress,
			historicalEvents,
			totalWords,
		);

	if (incomingEvents.length === 0) {
		return baseProgress;
	}

	return applyPuzzleEventsChronologically(
		baseProgress,
		incomingEvents,
		totalWords,
	);
}
