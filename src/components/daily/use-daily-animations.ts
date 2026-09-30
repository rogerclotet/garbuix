import { useCallback, useEffect, useRef, useState } from "react";
import type { PuzzleSubmitFeedback } from "@/components/puzzle/puzzle-types";
import { getWordCellKeys } from "@/lib/puzzle-helpers";
import { getPlayableWordLetters } from "@/lib/puzzle-text";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";
import { getSubmitFeedbackDuration } from "./daily-animation-timing";
import {
	buildFlyingLetterPaths,
	type FlyingLettersAnimation,
	GRID_GUESS_BOUNCE_MS,
	getWordCellKeysInOrder,
	HIGHLIGHT_AFTER_LAND_MS,
} from "./daily-flying-letters";

const LOCATE_FLASH_MS = 1300;
export function useDailyAnimations(puzzle: DailyPuzzlePublic) {
	const [highlightedWordId, setHighlightedWordId] = useState<number | null>(
		null,
	);
	const [flyingLettersAnimation, setFlyingLettersAnimation] =
		useState<FlyingLettersAnimation | null>(null);
	const [animatingWordId, setAnimatingWordId] = useState<number | null>(null);
	const [animatingPreExistingLetters, setAnimatingPreExistingLetters] =
		useState<Set<string>>(() => new Set());
	const [landedAnimatingCells, setLandedAnimatingCells] = useState<Set<string>>(
		() => new Set(),
	);
	const [bounceCells, setBounceCells] = useState<Set<string>>(() => new Set());
	const bounceClearTimersRef = useRef<Map<string, number>>(new Map());
	const flyingLettersIdRef = useRef(0);
	const pendingFlyCompleteRef = useRef<{
		wordId: number;
		pathCount: number;
	} | null>(null);
	const [submitFeedback, setSubmitFeedback] =
		useState<PuzzleSubmitFeedback | null>(null);
	// Transient outline on a word's grid cells when its list row is tapped.
	const [locateCells, setLocateCells] = useState<Set<string>>(new Set());
	const locateClearTimerRef = useRef<number | null>(null);
	const gridRef = useRef<HTMLDivElement>(null);
	const highlightResetTimerRef = useRef<number | null>(null);
	const submitFeedbackIdRef = useRef(0);
	const submitFeedbackResetTimerRef = useRef<number | null>(null);
	useEffect(
		() => () => {
			for (const timer of [
				highlightResetTimerRef.current,
				submitFeedbackResetTimerRef.current,
				locateClearTimerRef.current,
			]) {
				if (timer != null) window.clearTimeout(timer);
			}
			for (const timer of bounceClearTimersRef.current.values())
				window.clearTimeout(timer);
			bounceClearTimersRef.current.clear();
		},
		[],
	);
	const showSubmitFeedback = useCallback(
		(word: string, kind: PuzzleSubmitFeedback["kind"]) => {
			const nextFeedbackId = submitFeedbackIdRef.current + 1;
			submitFeedbackIdRef.current = nextFeedbackId;
			setSubmitFeedback({
				id: nextFeedbackId,
				word,
				kind,
			});

			if (submitFeedbackResetTimerRef.current != null) {
				window.clearTimeout(submitFeedbackResetTimerRef.current);
			}

			submitFeedbackResetTimerRef.current = window.setTimeout(() => {
				setSubmitFeedback((current) =>
					current?.id === nextFeedbackId ? null : current,
				);
				submitFeedbackResetTimerRef.current = null;
			}, getSubmitFeedbackDuration());
		},
		[],
	);

	const clearSubmitFeedback = useCallback(() => {
		if (submitFeedbackResetTimerRef.current != null) {
			window.clearTimeout(submitFeedbackResetTimerRef.current);
			submitFeedbackResetTimerRef.current = null;
		}
		setSubmitFeedback(null);
	}, []);

	const startWordHighlight = useCallback((wordId: number) => {
		setHighlightedWordId(wordId);
		if (highlightResetTimerRef.current != null) {
			window.clearTimeout(highlightResetTimerRef.current);
		}
		highlightResetTimerRef.current = window.setTimeout(() => {
			setHighlightedWordId((current) => (current === wordId ? null : current));
			highlightResetTimerRef.current = null;
		}, HIGHLIGHT_AFTER_LAND_MS);
	}, []);

	const finishFlyingLettersCleanup = useCallback(() => {
		setAnimatingWordId(null);
		setAnimatingPreExistingLetters(new Set());
		setLandedAnimatingCells(new Set());
		setBounceCells(new Set());
		setFlyingLettersAnimation(null);
		pendingFlyCompleteRef.current = null;
		for (const timer of bounceClearTimersRef.current.values()) {
			window.clearTimeout(timer);
		}
		bounceClearTimersRef.current.clear();
	}, []);

	const finishFlyingLettersFallback = useCallback(
		(wordId: number) => {
			finishFlyingLettersCleanup();
			startWordHighlight(wordId);
		},
		[finishFlyingLettersCleanup, startWordHighlight],
	);

	const handleFlyingLetterLand = useCallback((cellKey: string) => {
		setLandedAnimatingCells((previous) => {
			if (previous.has(cellKey)) {
				return previous;
			}
			const next = new Set(previous);
			next.add(cellKey);
			return next;
		});
		setBounceCells((previous) => {
			if (previous.has(cellKey)) {
				return previous;
			}
			const next = new Set(previous);
			next.add(cellKey);
			return next;
		});

		const existingTimer = bounceClearTimersRef.current.get(cellKey);
		if (existingTimer != null) {
			window.clearTimeout(existingTimer);
		}

		const timer = window.setTimeout(() => {
			setBounceCells((previous) => {
				if (!previous.has(cellKey)) {
					return previous;
				}
				const next = new Set(previous);
				next.delete(cellKey);
				return next;
			});
			bounceClearTimersRef.current.delete(cellKey);
		}, GRID_GUESS_BOUNCE_MS);
		bounceClearTimersRef.current.set(cellKey, timer);
	}, []);

	const triggerFlyingLetters = useCallback(
		(
			wordId: number,
			displayWord: string,
			preExistingLetterCells: Set<string>,
		) => {
			const slot = puzzle.wordSlots.find((wordSlot) => wordSlot.id === wordId);
			const gridRoot = gridRef.current;
			if (!slot || !gridRoot) {
				finishFlyingLettersFallback(wordId);
				return;
			}

			const prefersReducedMotion =
				typeof window !== "undefined" &&
				typeof window.matchMedia === "function" &&
				window.matchMedia("(prefers-reduced-motion: reduce)").matches;

			if (prefersReducedMotion) {
				finishFlyingLettersFallback(wordId);
				return;
			}

			setAnimatingWordId(wordId);
			setAnimatingPreExistingLetters(preExistingLetterCells);
			setLandedAnimatingCells(new Set());
			setBounceCells(new Set());

			window.requestAnimationFrame(() => {
				window.requestAnimationFrame(() => {
					const sourceElement = document.querySelector<HTMLElement>(
						'[data-slot="submit-feedback"]',
					);
					if (!sourceElement) {
						finishFlyingLettersFallback(wordId);
						return;
					}

					const letters = getPlayableWordLetters(displayWord);
					const paths = buildFlyingLetterPaths({
						sourceElement,
						targetCellKeys: getWordCellKeysInOrder(slot),
						letters,
						gridRoot,
					});

					if (paths.length === 0) {
						finishFlyingLettersFallback(wordId);
						return;
					}

					pendingFlyCompleteRef.current = {
						wordId,
						pathCount: paths.length,
					};
					flyingLettersIdRef.current += 1;
					setFlyingLettersAnimation({
						id: flyingLettersIdRef.current,
						paths,
					});
				});
			});
		},
		[finishFlyingLettersFallback, puzzle.wordSlots],
	);

	// Tapping an incomplete word outlines its grid cells so the
	// player can locate it, scrolling the grid into view on mobile when needed.
	const handleLocateWord = useCallback(
		(wordId: number) => {
			const slot = puzzle.wordSlots.find((item) => item.id === wordId);
			if (!slot) return;

			const cellKeys = getWordCellKeys(slot);
			// Clear first, then set on the next frame so the animation restarts even
			// when the same word is tapped repeatedly.
			if (locateClearTimerRef.current != null) {
				window.clearTimeout(locateClearTimerRef.current);
			}
			setLocateCells(new Set());
			window.requestAnimationFrame(() => {
				setLocateCells(cellKeys);
				locateClearTimerRef.current = window.setTimeout(() => {
					setLocateCells(new Set());
					locateClearTimerRef.current = null;
				}, LOCATE_FLASH_MS);
			});

			const grid = gridRef.current;
			if (grid && window.matchMedia("(max-width: 1023px)").matches) {
				const rect = grid.getBoundingClientRect();
				const offScreen = rect.top < 0 || rect.bottom > window.innerHeight;
				if (offScreen) {
					grid.scrollIntoView({ behavior: "smooth", block: "center" });
				}
			}
		},
		[puzzle.wordSlots],
	);

	return {
		gridRef,
		gridEffects: {
			highlightedWordId,
			animatingWordId,
			animatingPreExistingLetters,
			landedAnimatingCells,
			bounceCells,
			locateCells,
		},
		flyingLettersProps: {
			animation: flyingLettersAnimation,
			onLetterLand: handleFlyingLetterLand,
			onComplete: () => {
				if (pendingFlyCompleteRef.current) finishFlyingLettersCleanup();
			},
		},
		submitFeedback,
		showSubmitFeedback,
		clearSubmitFeedback,
		triggerFlyingLetters,
		handleLocateWord,
	};
}
