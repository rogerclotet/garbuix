import { createGuessHash, createUnlockToken } from "@/lib/puzzle-crypto";
import { getSlotHintCellKey } from "@/lib/puzzle-helpers";
import {
	type DailyPuzzlePrivate,
	type DailyPuzzlePublic,
	type GuessAddedEvent,
	type PuzzleClientEvent,
	type PuzzleProgressState,
	WORDS_PER_BONUS_CLUE,
} from "@/lib/puzzle-types";

type EventTypeCounts = Record<PuzzleClientEvent["type"], number>;

const MAX_HINTS = 3;

export type PuzzleSyncDiagnostics = {
	acceptedByType: EventTypeCounts;
	acceptedCount: number;
	duplicateInPayloadCount: number;
	existingOnServerCount: number;
	receivedByType: EventTypeCounts;
	receivedCount: number;
	sanitizedInvalidUnlockTokenCount: number;
	sanitizedMissingWordCount: number;
	sanitizedInvalidHintCount: number;
	sanitizedInvalidBonusWordCount: number;
};

type HintValidationState = {
	hintsUsed: number;
	hintedCells: Set<string>;
	clueWordIds: Set<number>;
	// Mirrors the reducer's bonus counter, so a reveal is only accepted once the
	// words that earn it have been counted.
	guessHashes: Set<string>;
	bonusWordsFound: number;
	bonusCluesRevealed: number;
};

function createEmptyEventTypeCounts(): EventTypeCounts {
	return {
		guess_added: 0,
		hint_used: 0,
		text_hint_requested: 0,
		text_hint_fallback: 0,
		bonus_clue_revealed: 0,
		letters_shuffled: 0,
	};
}

function buildValidCellKeys(privateSnapshot: DailyPuzzlePrivate): Set<string> {
	const keys = new Set<string>();
	for (let row = 0; row < privateSnapshot.gridLetters.length; row += 1) {
		for (let col = 0; col < privateSnapshot.gridLetters[row].length; col += 1) {
			if (privateSnapshot.gridLetters[row][col]) {
				keys.add(`${row},${col}`);
			}
		}
	}
	return keys;
}

function buildValidWordIds(publicSnapshot: DailyPuzzlePublic): Set<number> {
	return new Set(publicSnapshot.wordSlots.map((slot) => slot.id));
}

export type ExistingHintState = {
	hintsUsed: number;
	hintedCells: string[];
	clueWordIds: number[];
	guessHashes: string[];
	bonusWordsFound: number;
};

function createHintValidationState(
	existing: ExistingHintState | undefined,
	bonusCluesRevealed: number,
): HintValidationState {
	return {
		hintsUsed: existing?.hintsUsed ?? 0,
		hintedCells: new Set(existing?.hintedCells ?? []),
		clueWordIds: new Set(existing?.clueWordIds ?? []),
		guessHashes: new Set(existing?.guessHashes ?? []),
		bonusWordsFound: existing?.bonusWordsFound ?? 0,
		bonusCluesRevealed,
	};
}

// The client decides whether a guess was a valid off-puzzle word, so the claim
// is checked against the hashes of every word that qualifies for this puzzle.
function sanitizeBonusWordClaim(
	event: GuessAddedEvent,
	bonusGuessHashes: ReadonlySet<string>,
	diagnostics: PuzzleSyncDiagnostics,
): GuessAddedEvent {
	if (
		!event.payload.validNotInPuzzle ||
		bonusGuessHashes.has(event.payload.guessHash)
	) {
		return event;
	}

	diagnostics.sanitizedInvalidBonusWordCount += 1;
	return { ...event, payload: { ...event.payload, validNotInPuzzle: false } };
}

// Same rule as applyPuzzleEvent: only a guess's first appearance counts.
function countBonusWord(event: GuessAddedEvent, state: HintValidationState) {
	const { guessHash, matchedWordId, validNotInPuzzle } = event.payload;
	if (state.guessHashes.has(guessHash)) return;
	state.guessHashes.add(guessHash);
	if (validNotInPuzzle && matchedWordId == null) {
		state.bonusWordsFound += 1;
	}
}

function isHintEventAccepted(
	event: PuzzleClientEvent,
	state: HintValidationState,
	validCellKeys: Set<string>,
	validWordIds: Set<number>,
): boolean {
	switch (event.type) {
		case "hint_used": {
			const { cellKey } = event.payload;
			if (
				!validCellKeys.has(cellKey) ||
				state.hintsUsed >= MAX_HINTS ||
				state.hintedCells.has(cellKey)
			) {
				return false;
			}
			state.hintedCells.add(cellKey);
			state.hintsUsed += 1;
			return true;
		}
		case "text_hint_requested": {
			const { wordId } = event.payload;
			if (
				!validWordIds.has(wordId) ||
				state.hintsUsed >= MAX_HINTS ||
				state.clueWordIds.has(wordId)
			) {
				return false;
			}
			state.clueWordIds.add(wordId);
			state.hintsUsed += 1;
			return true;
		}
		case "text_hint_fallback": {
			const { cellKey, wordId } = event.payload;
			if (
				!validWordIds.has(wordId) ||
				!validCellKeys.has(cellKey) ||
				!state.clueWordIds.has(wordId) ||
				state.hintedCells.has(cellKey)
			) {
				return false;
			}
			state.hintedCells.add(cellKey);
			return true;
		}
		case "bonus_clue_revealed": {
			const { cellKey } = event.payload;
			const earned = Math.floor(state.bonusWordsFound / WORDS_PER_BONUS_CLUE);
			if (
				!validCellKeys.has(cellKey) ||
				state.hintedCells.has(cellKey) ||
				state.bonusCluesRevealed >= earned
			) {
				return false;
			}
			state.hintedCells.add(cellKey);
			state.bonusCluesRevealed += 1;
			return true;
		}
		default:
			return true;
	}
}

export async function filterSyncablePuzzleEvents(options: {
	events: PuzzleClientEvent[];
	existingEventIds: Set<string>;
	publicSnapshot: DailyPuzzlePublic;
	privateSnapshot: DailyPuzzlePrivate;
	existingHintState?: ExistingHintState;
	// Bonus reveals already stored for this player and puzzle.
	existingBonusCluesRevealed?: number;
	// Guess hashes of the valid words that aren't part of the puzzle.
	bonusGuessHashes: ReadonlySet<string>;
}) {
	const {
		bonusGuessHashes,
		events,
		existingBonusCluesRevealed = 0,
		existingEventIds,
		existingHintState,
		privateSnapshot,
		publicSnapshot,
	} = options;
	const filteredEvents: PuzzleClientEvent[] = [];
	const rejectedEventIds: string[] = [];
	const seenEventIds = new Set<string>();
	const validCellKeys = buildValidCellKeys(privateSnapshot);
	const validWordIds = buildValidWordIds(publicSnapshot);
	const hintState = createHintValidationState(
		existingHintState,
		existingBonusCluesRevealed,
	);
	const diagnostics: PuzzleSyncDiagnostics = {
		acceptedByType: createEmptyEventTypeCounts(),
		acceptedCount: 0,
		duplicateInPayloadCount: 0,
		existingOnServerCount: 0,
		receivedByType: createEmptyEventTypeCounts(),
		receivedCount: events.length,
		sanitizedInvalidUnlockTokenCount: 0,
		sanitizedMissingWordCount: 0,
		sanitizedInvalidHintCount: 0,
		sanitizedInvalidBonusWordCount: 0,
	};

	for (const event of events) {
		diagnostics.receivedByType[event.type] += 1;

		if (existingEventIds.has(event.id)) {
			diagnostics.existingOnServerCount += 1;
			continue;
		}

		if (seenEventIds.has(event.id)) {
			diagnostics.duplicateInPayloadCount += 1;
			continue;
		}

		let acceptedEvent = event;

		if (event.type === "guess_added" && event.payload.matchedWordId != null) {
			const slot = publicSnapshot.wordSlots.find(
				(wordSlot) => wordSlot.id === event.payload.matchedWordId,
			);
			const privateWord = privateSnapshot.wordSlots.find(
				(wordSlot) => wordSlot.id === event.payload.matchedWordId,
			);

			if (!slot || !privateWord) {
				diagnostics.sanitizedMissingWordCount += 1;
				acceptedEvent = {
					...event,
					payload: {
						guessHash: event.payload.guessHash,
						matchedWordId: null,
						unlockToken: null,
					},
				};
			} else {
				const expectedUnlockToken = await createUnlockToken(
					slot.slotSalt,
					privateWord.normalizedWord,
				);
				if (event.payload.unlockToken !== expectedUnlockToken) {
					diagnostics.sanitizedInvalidUnlockTokenCount += 1;
					acceptedEvent = {
						...event,
						payload: {
							guessHash: event.payload.guessHash,
							matchedWordId: null,
							unlockToken: null,
						},
					};
				}
			}
		}

		if (acceptedEvent.type === "guess_added") {
			acceptedEvent = sanitizeBonusWordClaim(
				acceptedEvent,
				bonusGuessHashes,
				diagnostics,
			);
			countBonusWord(acceptedEvent, hintState);
		}

		if (
			event.type === "hint_used" ||
			event.type === "text_hint_requested" ||
			event.type === "text_hint_fallback" ||
			event.type === "bonus_clue_revealed"
		) {
			if (
				!isHintEventAccepted(
					acceptedEvent,
					hintState,
					validCellKeys,
					validWordIds,
				)
			) {
				diagnostics.sanitizedInvalidHintCount += 1;
				rejectedEventIds.push(event.id);
				continue;
			}
		}

		filteredEvents.push(acceptedEvent);
		diagnostics.acceptedByType[event.type] += 1;
		diagnostics.acceptedCount += 1;
		seenEventIds.add(event.id);
	}

	return {
		diagnostics,
		filteredEvents,
		rejectedEventIds,
	};
}

// Rejected events are acknowledged too: the server has ruled on them, and a
// client that kept them queued would resend them forever while showing a
// letter the account never earned. Dropping them lets it adopt the server's
// progress instead.
// The one letter each AI clue may fall back to when its text is missing.
function getClueFallbackCells(
	playedSnapshot: DailyPuzzlePublic,
	clueWordIds: number[],
): Set<string> {
	const cells = new Set<string>();
	for (const wordId of clueWordIds) {
		const slot = playedSnapshot.wordSlots.find((item) => item.id === wordId);
		const cellKey = slot ? getSlotHintCellKey(playedSnapshot, slot) : null;
		if (cellKey) cells.add(cellKey);
	}
	return cells;
}

// The fewest bonus reveals that explain the letters on the board: every letter
// that isn't a clue's fallback and isn't covered by a letter hint. Guest play
// and imports leave no stored reveal events, so sync takes the larger of this
// and the stored count. It never overcounts, because a bonus letter that
// happens to land on a fallback cell is not counted.
export function countDerivedBonusClues(
	progress: Pick<
		PuzzleProgressState,
		"hintedCells" | "hintsUsed" | "clueWordIds"
	>,
	playedSnapshot: DailyPuzzlePublic,
): number {
	const fallbackCells = getClueFallbackCells(
		playedSnapshot,
		progress.clueWordIds,
	);
	const unexplained = progress.hintedCells.filter(
		(cellKey) => !fallbackCells.has(cellKey),
	).length;
	const letterHints = Math.max(
		0,
		progress.hintsUsed - progress.clueWordIds.length,
	);
	return Math.max(0, unexplained - letterHints);
}

async function verifyFoundWords(
	progress: PuzzleProgressState,
	playedSnapshot: DailyPuzzlePublic,
	privateSnapshot: DailyPuzzlePrivate,
) {
	const guessedWordIds: number[] = [];
	const revealedWordTokens: Record<string, string> = {};
	const foundWordHashes: string[] = [];
	for (const wordId of new Set(progress.guessedWordIds)) {
		const slot = playedSnapshot.wordSlots.find((item) => item.id === wordId);
		const word = privateSnapshot.wordSlots.find((item) => item.id === wordId);
		const token = progress.revealedWordTokens[String(wordId)];
		if (!slot || !word || !token) continue;
		if (token !== (await createUnlockToken(slot.slotSalt, word.normalizedWord)))
			continue;
		guessedWordIds.push(wordId);
		revealedWordTokens[String(wordId)] = token;
		foundWordHashes.push(
			await createGuessHash(playedSnapshot.id, word.normalizedWord),
		);
	}
	return { guessedWordIds, revealedWordTokens, foundWordHashes };
}

// Holds a whole progress state, as a guest import delivers it, to the rules sync
// applies event by event: found words need their unlock token, bonus words must
// be real extra words, clues stay within budget, and every revealed letter has
// to be explained by a clue fallback, a letter hint, or an earned bonus reveal.
// Letters beyond that allowance are dropped, earliest kept.
export async function sanitizeProgressState(options: {
	progress: PuzzleProgressState;
	playedSnapshot: DailyPuzzlePublic;
	privateSnapshot: DailyPuzzlePrivate;
	bonusGuessHashes: ReadonlySet<string>;
}): Promise<PuzzleProgressState> {
	const { bonusGuessHashes, playedSnapshot, privateSnapshot, progress } =
		options;
	const { guessedWordIds, revealedWordTokens, foundWordHashes } =
		await verifyFoundWords(progress, playedSnapshot, privateSnapshot);
	const guessHashes = [
		...new Set([...progress.guessHashes, ...foundWordHashes]),
	];
	const bonusWordsFound = Math.min(
		progress.bonusWordsFound,
		guessHashes.filter((hash) => bonusGuessHashes.has(hash)).length,
	);

	const validWordIds = buildValidWordIds(playedSnapshot);
	const clueWordIds = [...new Set(progress.clueWordIds)]
		.filter((wordId) => validWordIds.has(wordId))
		.slice(0, MAX_HINTS);
	const hintsUsed = Math.min(
		MAX_HINTS,
		Math.max(progress.hintsUsed, clueWordIds.length),
	);

	const validCellKeys = buildValidCellKeys(privateSnapshot);
	const fallbackCells = getClueFallbackCells(playedSnapshot, clueWordIds);
	let unexplainedAllowance =
		hintsUsed -
		clueWordIds.length +
		Math.floor(bonusWordsFound / WORDS_PER_BONUS_CLUE);
	const hintedCells: string[] = [];
	for (const cellKey of new Set(progress.hintedCells)) {
		if (!validCellKeys.has(cellKey)) continue;
		if (!fallbackCells.has(cellKey)) {
			if (unexplainedAllowance === 0) continue;
			unexplainedAllowance -= 1;
		}
		hintedCells.push(cellKey);
	}

	const sortedLetters = (letters: string[]) => [...letters].sort().join("|");
	const shuffledLetters =
		sortedLetters(progress.shuffledLetters) ===
		sortedLetters(playedSnapshot.letters)
			? progress.shuffledLetters
			: [...playedSnapshot.initialShuffledLetters];

	return {
		...progress,
		guessHashes,
		guessCount: guessHashes.length,
		guessedWordIds,
		revealedWordTokens,
		bonusWordsFound,
		clueWordIds,
		hintsUsed,
		hintedCells,
		shuffledLetters,
		completedAt:
			guessedWordIds.length === privateSnapshot.wordSlots.length
				? progress.completedAt
				: null,
	};
}

export function collectAckedEventIds(options: {
	existingEventIds: Set<string>;
	filteredEvents: PuzzleClientEvent[];
	rejectedEventIds: string[];
}) {
	return Array.from(
		new Set([
			...options.existingEventIds,
			...options.filteredEvents.map((event) => event.id),
			...options.rejectedEventIds,
		]),
	);
}

// Everything the leaderboard score is built from (see scoreFor in
// leaderboard.server): words found, then clues, then tries, then whether the
// player has finished.
export type LeaderboardScoreState = {
	wordsFound: number;
	hintsUsed: number;
	guessCount: number;
	completed: boolean;
};

// A guess that matches nothing still moves the player: tries break ties between
// equal clue counts, so the board is wrong until the new count reaches it. Any
// difference republishes, in either direction.
export function hasLeaderboardScoreDelta(
	previous: LeaderboardScoreState,
	next: LeaderboardScoreState,
): boolean {
	return (
		previous.wordsFound !== next.wordsFound ||
		previous.hintsUsed !== next.hintsUsed ||
		previous.guessCount !== next.guessCount ||
		previous.completed !== next.completed
	);
}
