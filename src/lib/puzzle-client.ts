import {
	createAnswerHash,
	createGuessHash,
	createUnlockToken,
	openAnswerCapsule,
	openHintCapsule,
} from "@/lib/puzzle-crypto";
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

	if (isAlreadyFound || isDuplicateGuess) {
		return {
			kind: "already_found" as const,
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

	if (!matchedSlot) {
		return {
			kind: options.puzzle.validNormalizedGuesses.includes(normalizedGuess)
				? ("valid_but_not_in_puzzle" as const)
				: ("not_in_dictionary" as const),
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
