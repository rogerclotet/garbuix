import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { usePuzzleAnimations } from "@/components/puzzle/use-puzzle-animations";
import { isVibrationEnabled } from "@/lib/anon-identity";
import { createPuzzleEvent, resolveGuess } from "@/lib/puzzle-client";
import { getRandomHintCellKey, getSlotCellKey } from "@/lib/puzzle-helpers";
import { formatGuess } from "@/lib/puzzle-text";
import {
	type DailyPuzzlePublic,
	type PuzzleClientEvent,
	type PuzzleProgressState,
	WORDS_PER_BONUS_CLUE,
} from "@/lib/puzzle-types";
import { shuffleArray } from "@/lib/shuffle";

const POINTER_CLICK_DEDUP_MS = 350;
const HAPTIC_TAP_MS = 14;
const HAPTIC_SUBMIT_MS = 18;
const HAPTIC_SUCCESS_PATTERN = [14, 28, 20];
const HAPTIC_ERROR_PATTERN = [24, 32, 16];

// Classic input policy: event recording, bonus words, haptics and feedback.
// Mini uses the same guess resolver but has different input and hint rules.
export function useDailyActions({
	puzzle,
	derivedProgress,
	applyLocalEvent,
	cellLetters,
	revealedCells,
	bonusCluesEnabled,
	showSubmitFeedback,
	clearSubmitFeedback,
	triggerFlyingLetters,
	markCompleting,
}: {
	puzzle: DailyPuzzlePublic;
	derivedProgress: PuzzleProgressState;
	applyLocalEvent: (event: PuzzleClientEvent) => void;
	cellLetters: Map<string, string>;
	revealedCells: Set<string>;
	bonusCluesEnabled: boolean;
	markCompleting: () => void;
} & Pick<
	ReturnType<typeof usePuzzleAnimations>,
	"showSubmitFeedback" | "clearSubmitFeedback" | "triggerFlyingLetters"
>) {
	const totalWords = puzzle.wordSlots.length;
	const [currentGuess, setCurrentGuess] = useState("");
	const lastPointerPressAtRef = useRef(0);
	const triggerHaptic = useCallback(
		(pattern: number | number[] = HAPTIC_TAP_MS) => {
			if (typeof navigator === "undefined") {
				return;
			}

			if (typeof navigator.vibrate !== "function") {
				return;
			}

			if (!isVibrationEnabled()) {
				return;
			}

			navigator.vibrate(pattern);
		},
		[],
	);

	const runPressAction = useCallback(
		(
			event: React.PointerEvent<HTMLButtonElement>,
			action: () => void,
		): void => {
			if (event.pointerType === "mouse") {
				if (event.type !== "pointerdown" || event.button !== 0) {
					return;
				}
			} else if (event.type !== "pointerup") {
				return;
			}

			lastPointerPressAtRef.current = performance.now();
			event.preventDefault();
			action();
		},
		[],
	);

	const runClickAction = useCallback(
		(_event: React.MouseEvent<HTMLButtonElement>, action: () => void): void => {
			const elapsedSincePointerPress =
				performance.now() - lastPointerPressAtRef.current;
			if (elapsedSincePointerPress < POINTER_CLICK_DEDUP_MS) {
				return;
			}

			action();
		},
		[],
	);

	const handleGuess = useCallback(async () => {
		triggerHaptic(HAPTIC_SUBMIT_MS);

		if (!currentGuess.trim()) return;
		const guess = currentGuess.trim();
		const prettyGuess = formatGuess(guess);

		if (!/^[a-zA-ZÀ-ÿçÇ·]+$/.test(guess)) {
			triggerHaptic(HAPTIC_ERROR_PATTERN);
			showSubmitFeedback(prettyGuess, "invalid_input");
			setCurrentGuess("");
			return;
		}

		const result = await resolveGuess({
			puzzle,
			progress: derivedProgress,
			guess,
		});

		showSubmitFeedback(prettyGuess, result.kind);

		const isNewBonusWord =
			result.kind === "valid_but_not_in_puzzle" && !result.isRepeatGuess;

		const preExistingLetterCells = new Set<string>();
		if (result.kind === "new_word" && result.matchedSlotId != null) {
			const matchedSlot = puzzle.wordSlots.find(
				(wordSlot) => wordSlot.id === result.matchedSlotId,
			);
			if (matchedSlot) {
				for (let index = 0; index < matchedSlot.length; index += 1) {
					const cellKey = getSlotCellKey(matchedSlot, index);
					if (cellLetters.has(cellKey)) {
						preExistingLetterCells.add(cellKey);
					}
				}
			}
		}

		if (!result.isRepeatGuess) {
			applyLocalEvent(
				createPuzzleEvent("guess_added", {
					guessHash: result.guessHash,
					matchedWordId: result.matchedSlotId,
					unlockToken: result.unlockToken,
					validNotInPuzzle: isNewBonusWord,
				}),
			);
		}

		// Every WORDS_PER_BONUS_CLUE-th valid off-puzzle word grants a free random
		// letter reveal. The counter updates asynchronously via the event above, so
		// we look one ahead.
		if (isNewBonusWord && bonusCluesEnabled) {
			const nextBonusCount = derivedProgress.bonusWordsFound + 1;
			if (nextBonusCount % WORDS_PER_BONUS_CLUE === 0) {
				const cellKey = getRandomHintCellKey(puzzle, revealedCells);
				if (cellKey) {
					applyLocalEvent(
						createPuzzleEvent("bonus_clue_revealed", { cellKey }),
					);
					triggerHaptic(HAPTIC_SUCCESS_PATTERN);
					toast.success("Lletra desbloquejada!", {
						description: `Has trobat ${WORDS_PER_BONUS_CLUE} paraules vàlides de fora del joc.`,
					});
				}
			}
		}

		if (result.kind === "new_word") {
			triggerHaptic(HAPTIC_SUCCESS_PATTERN);
			if (result.matchedSlotId != null && result.displayWord) {
				triggerFlyingLetters(
					result.matchedSlotId,
					result.displayWord,
					preExistingLetterCells,
				);
			}

			if (derivedProgress.guessedWordIds.length + 1 === totalWords) {
				markCompleting();
			}
		} else if (result.kind === "not_in_dictionary") {
			triggerHaptic(HAPTIC_ERROR_PATTERN);
		}

		setCurrentGuess("");
	}, [
		applyLocalEvent,
		bonusCluesEnabled,
		cellLetters,
		currentGuess,
		derivedProgress,
		puzzle,
		revealedCells,
		showSubmitFeedback,
		totalWords,
		triggerFlyingLetters,
		triggerHaptic,
		markCompleting,
	]);

	const handleLetterClick = useCallback(
		(letter: string) => {
			triggerHaptic(HAPTIC_TAP_MS);
			clearSubmitFeedback();
			setCurrentGuess((previous) => previous + letter);
		},
		[clearSubmitFeedback, triggerHaptic],
	);

	const handleBackspace = useCallback(() => {
		triggerHaptic(HAPTIC_TAP_MS);
		clearSubmitFeedback();
		setCurrentGuess((previous) => previous.slice(0, -1));
	}, [clearSubmitFeedback, triggerHaptic]);

	const handleShuffle = useCallback(() => {
		triggerHaptic(HAPTIC_TAP_MS);
		const shuffledLetters = shuffleArray(derivedProgress.shuffledLetters);
		applyLocalEvent(
			createPuzzleEvent("letters_shuffled", {
				shuffledLetters,
			}),
		);
	}, [applyLocalEvent, derivedProgress.shuffledLetters, triggerHaptic]);

	return {
		currentGuess,
		triggerHaptic,
		runPressAction,
		runClickAction,
		handleGuess,
		handleLetterClick,
		handleBackspace,
		handleShuffle,
	};
}
