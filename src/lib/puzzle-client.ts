import {
	createAnswerHash,
	createGuessHash,
	createUnlockToken,
	openAnswerCapsule,
	openHintCapsule,
} from "@/lib/puzzle-crypto";
import { getRevealedSlotWord } from "@/lib/puzzle-helpers";
import { normalizeWord } from "@/lib/puzzle-text";
import type {
	DailyPuzzlePublic,
	PuzzleClientEvent,
	PuzzleProgressState,
} from "@/lib/puzzle-types";

export type GuessFeedbackKind =
	| "new_word"
	| "already_found"
	| "valid_but_not_in_puzzle"
	| "not_in_dictionary";

export type RevealedWord = { wordId: number; unlockToken: string };

export async function resolveGuess(options: {
	puzzle: DailyPuzzlePublic;
	progress: PuzzleProgressState;
	guess: string;
}) {
	const normalizedGuess = normalizeWord(options.guess.trim());
	const guessHash = await createGuessHash(options.puzzle.id, normalizedGuess);
	const matchedSlot = await findMatchingWordSlot(
		options.puzzle,
		normalizedGuess,
	);
	const isAlreadyFound =
		matchedSlot != null &&
		options.progress.guessedWordIds.includes(matchedSlot.id);
	const isDuplicateGuess = options.progress.guessHashes.includes(guessHash);

	// Word was already correctly found in the puzzle (or hash matches a puzzle word)
	if (isAlreadyFound || (isDuplicateGuess && matchedSlot != null)) {
		return {
			kind: "already_found" as const,
			isRepeatGuess: true,
			displayWord:
				matchedSlot != null
					? await decryptWordFromGuess(matchedSlot, normalizedGuess)
					: null,
			guessHash,
			normalizedGuess,
			matchedSlotId: matchedSlot?.id ?? null,
			unlockToken: matchedSlot
				? await createUnlockToken(matchedSlot.slotSalt, normalizedGuess)
				: null,
		};
	}

	// Word was tried before but isn't in the puzzle — repeat the original feedback
	if (isDuplicateGuess) {
		return {
			kind: options.puzzle.validNormalizedGuesses.includes(normalizedGuess)
				? ("valid_but_not_in_puzzle" as const)
				: ("not_in_dictionary" as const),
			isRepeatGuess: true,
			displayWord: null,
			guessHash,
			normalizedGuess,
			matchedSlotId: null,
			unlockToken: null,
		};
	}

	if (!matchedSlot) {
		return {
			kind: options.puzzle.validNormalizedGuesses.includes(normalizedGuess)
				? ("valid_but_not_in_puzzle" as const)
				: ("not_in_dictionary" as const),
			isRepeatGuess: false,
			displayWord: null,
			guessHash,
			normalizedGuess,
			matchedSlotId: null,
			unlockToken: null,
		};
	}

	const unlockToken = await createUnlockToken(
		matchedSlot.slotSalt,
		normalizedGuess,
	);
	return {
		kind: "new_word" as const,
		isRepeatGuess: false,
		displayWord: await openAnswerCapsule(
			matchedSlot.answerCapsule,
			unlockToken,
		),
		guessHash,
		normalizedGuess,
		matchedSlotId: matchedSlot.id,
		unlockToken,
	};
}

export async function findMatchingWordSlot(
	puzzle: DailyPuzzlePublic,
	normalizedGuess: string,
) {
	for (const slot of puzzle.wordSlots) {
		const answerHash = await createAnswerHash(slot.slotSalt, normalizedGuess);
		if (answerHash === slot.answerHash) {
			return slot;
		}
	}

	return null;
}

// Words the player has not found whose every cell is already on the board,
// filled in by hints or by crossing words. The letters are checked against the
// answer hash, exactly as a typed guess would be.
export async function findFullyRevealedWords(
	puzzle: DailyPuzzlePublic,
	guessedWordIds: number[],
	cellLetters: Map<string, string>,
): Promise<RevealedWord[]> {
	const words = await Promise.all(
		puzzle.wordSlots
			.filter((slot) => !guessedWordIds.includes(slot.id))
			.map(async (slot) => {
				const word = getRevealedSlotWord(slot, cellLetters);
				if (word === null) return null;
				const answerHash = await createAnswerHash(slot.slotSalt, word);
				if (answerHash !== slot.answerHash) return null;
				return {
					wordId: slot.id,
					unlockToken: await createUnlockToken(slot.slotSalt, word),
				};
			}),
	);

	return words.filter((word) => word !== null);
}

export async function decryptWordFromGuess(
	slot: DailyPuzzlePublic["wordSlots"][number],
	normalizedGuess: string,
) {
	const unlockToken = await createUnlockToken(slot.slotSalt, normalizedGuess);
	return openAnswerCapsule(slot.answerCapsule, unlockToken);
}

export async function decodeRevealedAnswers(
	puzzle: DailyPuzzlePublic,
	progress: PuzzleProgressState,
) {
	const entries = await Promise.all(
		puzzle.wordSlots
			.filter((slot) => progress.guessedWordIds.includes(slot.id))
			.map(async (slot) => {
				const unlockToken = progress.revealedWordTokens[String(slot.id)];
				if (!unlockToken) return null;
				return [
					slot.id,
					await openAnswerCapsule(slot.answerCapsule, unlockToken),
				] as const;
			}),
	);

	return Object.fromEntries(
		entries.filter(Boolean) as Array<readonly [number, string]>,
	);
}

export async function decodeHintLetters(
	puzzle: DailyPuzzlePublic,
	progress: PuzzleProgressState,
) {
	const hintedEntries = await Promise.all(
		puzzle.hintCapsules
			.filter((capsule) => progress.hintedCells.includes(capsule.cellKey))
			.map(
				async (capsule) =>
					[
						capsule.cellKey,
						await openHintCapsule(
							capsule.hintCapsule,
							capsule.hintSalt,
							capsule.cellKey,
						),
					] as const,
			),
	);

	return Object.fromEntries(hintedEntries);
}

export async function resolveFoundWords({
	puzzle,
	guessHashes,
	revealedAnswers,
}: {
	puzzle: Pick<DailyPuzzlePublic, "id" | "validNormalizedGuesses">;
	guessHashes: PuzzleProgressState["guessHashes"];
	revealedAnswers: Record<number, string>;
}) {
	const puzzleWords = new Map(
		Object.values(revealedAnswers).map((word) => [normalizeWord(word), word]),
	);
	const guessedHashes = new Set(guessHashes);
	const candidates = [...new Set(puzzle.validNormalizedGuesses)].filter(
		(word) => !puzzleWords.has(word),
	);
	// Recover valid guesses from existing progress, including games saved before
	// the completion word list was added. Invalid guesses never enter the list.
	const bonusWords = await Promise.all(
		candidates.map(async (word) => ({
			word,
			found: guessedHashes.has(await createGuessHash(puzzle.id, word)),
		})),
	);
	return [
		...Array.from(puzzleWords.values(), (word) => ({ word, isInPuzzle: true })),
		...bonusWords
			.filter(({ found }) => found)
			.map(({ word }) => ({ word, isInPuzzle: false })),
	].sort((left, right) => left.word.localeCompare(right.word, "ca"));
}

export function createPuzzleEvent<T extends PuzzleClientEvent["type"]>(
	type: T,
	payload: Extract<PuzzleClientEvent, { type: T }>["payload"],
): Extract<PuzzleClientEvent, { type: T }> {
	return {
		id: crypto.randomUUID(),
		at: new Date().toISOString(),
		type,
		payload,
	} as Extract<PuzzleClientEvent, { type: T }>;
}
