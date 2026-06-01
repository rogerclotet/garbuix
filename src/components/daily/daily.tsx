import { Loader2Icon, Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	getLetterLayout,
	getSkipSharePreview,
	isVibrationEnabled,
} from "@/lib/anon-identity";
import { authClient } from "@/lib/auth-client";
import { AI_WORD_CLUES_FLAG, PEER_CLUES_FLAG } from "@/lib/feature-flags";
import {
	createPuzzleEvent,
	decodeHintLetters,
	decodeRevealedAnswers,
	resolveGuess,
} from "@/lib/puzzle-client";
import {
	getDeviceId,
	getSortedAnonymousHistoryEntries,
	hasSeenHowToPlay,
	hasSeenWelcome,
	markHowToPlaySeen,
	markWelcomeSeen,
} from "@/lib/puzzle-local";
import { getWordClues } from "@/lib/puzzle-server-fns";
import {
	calculateHistoryStreaks,
	upsertHistoryEntry,
} from "@/lib/puzzle-streaks";
import { formatGuess } from "@/lib/puzzle-text";
import { shuffleArray } from "@/lib/shuffle";
import { useActiveSessionUser } from "@/lib/use-active-session-user";
import { useClueRequests } from "@/lib/use-clue-requests";
import { useFeatureFlag } from "@/lib/use-feature-flag";
import { useObservability } from "@/lib/use-observability";
import { DailyConfetti } from "./daily-confetti";
import { DailyControls } from "./daily-controls";
import { DailyGrid } from "./daily-grid";
import {
	buildCellLetters,
	buildHistoryEntry,
	buildRevealedCells,
	getGuessKeyboardAction,
	getNextHintCellKey,
	getSlotHintCellKey,
	getSortedWordSlots,
	getWordCellKeys,
} from "./daily-helpers";
import type { DailyData, DailySubmitFeedback } from "./daily-types";
import { DailyWordList } from "./daily-word-list";
import { openHowToPlay } from "./how-to-play-store";
import { SharePreviewDialog } from "./share-preview-dialog";
import { shareProgress } from "./share-progress";
import { useDailyProgress } from "./use-daily-progress";
import { WelcomeDialog } from "./welcome-dialog";
import { WinDialog } from "./win-dialog";

const POINTER_CLICK_DEDUP_MS = 350;
const SUBMIT_FEEDBACK_DURATION_MS = 520;
const REDUCED_MOTION_SUBMIT_FEEDBACK_DURATION_MS = 200;
const HAPTIC_TAP_MS = 14;
const HAPTIC_SUBMIT_MS = 18;
const HAPTIC_SUCCESS_PATTERN = [14, 28, 20];
const HAPTIC_ERROR_PATTERN = [24, 32, 16];
// If an AI clue can't be loaded within this window, degrade to a silent
// single-letter reveal so the hint button never feels broken.
const CLUE_FETCH_TIMEOUT_MS = 8000;
// How long a freshly requested clue's grid ring stays lit before fading out, and
// the fade duration itself (kept in sync with the CSS opacity transition).
const CLUE_GRID_HIGHLIGHT_MS = 5000;
const CLUE_GRID_FADE_MS = 600;
// Duration of the teal tap-to-locate flash (kept in sync with the CSS animation).
const LOCATE_FLASH_MS = 1300;

function getSubmitFeedbackDuration() {
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function"
	) {
		return SUBMIT_FEEDBACK_DURATION_MS;
	}

	return window.matchMedia("(prefers-reduced-motion: reduce)").matches
		? REDUCED_MOTION_SUBMIT_FEEDBACK_DURATION_MS
		: SUBMIT_FEEDBACK_DURATION_MS;
}

function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	return (
		target.isContentEditable ||
		target.closest(
			"input, textarea, select, [contenteditable='true'], [role='textbox']",
		) !== null
	);
}

export function Daily({ initialData }: { initialData: DailyData }) {
	const { activeUser } = useActiveSessionUser(initialData.sessionUser);
	const puzzle = initialData.puzzle;
	const totalWords = puzzle.wordSlots.length;
	const deviceId = useMemo(() => getDeviceId(), []);
	const [currentGuess, setCurrentGuess] = useState("");
	const [revealedAnswers, setRevealedAnswers] = useState<
		Record<number, string>
	>({});
	const [hintLetters, setHintLetters] = useState<Record<string, string>>({});
	const [highlightedWordId, setHighlightedWordId] = useState<number | null>(
		null,
	);
	const [clueTextsByWordId, setClueTextsByWordId] = useState<
		Record<number, string>
	>({});
	// Clues for words the player has already found, surfaced in the list out of
	// curiosity or to help a friend. Kept separate from the requested-hint clues
	// above so the hint fetch effect can freely reset its own map.
	const [foundClueTextsByWordId, setFoundClueTextsByWordId] = useState<
		Record<number, string>
	>({});
	// Word ids the player just asked a clue for; drained into a toast once the
	// clue text resolves. Reloads refetch every clue but add nothing here, so
	// they stay quiet.
	const pendingClueToastWordIdsRef = useRef<Set<number>>(new Set());
	const aiCluesEnabled = useFeatureFlag(AI_WORD_CLUES_FLAG);
	const peerCluesEnabled = useFeatureFlag(PEER_CLUES_FLAG);
	// Circle is the default; a player can opt back into the grid via
	// /preferencies. Initialise to the default so SSR markup is deterministic,
	// then read the stored choice after mount.
	const [circleLetters, setCircleLetters] = useState(true);
	useEffect(() => {
		setCircleLetters(getLetterLayout() === "circle");
	}, []);
	const { subscribe: subscribeClueRequests, requestClue } = useClueRequests();
	// Word ids the player has asked other players for help with (awaiting a reply).
	const [requestedHelpWordIds, setRequestedHelpWordIds] = useState<number[]>(
		[],
	);
	// Clue texts delivered by other players, keyed by word id.
	const [peerClueTextsByWordId, setPeerClueTextsByWordId] = useState<
		Record<number, string>
	>({});
	const [submitFeedback, setSubmitFeedback] =
		useState<DailySubmitFeedback | null>(null);
	const [anonymousHistoryEntries, setAnonymousHistoryEntries] = useState(
		() => initialData.historyEntries ?? [],
	);
	// Transient grid highlight for a freshly requested AI clue: the gradient ring
	// shows for 5s, then fades back to the regular cell colors.
	const [clueGridCells, setClueGridCells] = useState<Set<string>>(new Set());
	const [clueGridFading, setClueGridFading] = useState(false);
	const clueGridFadeTimerRef = useRef<number | null>(null);
	const clueGridClearTimerRef = useRef<number | null>(null);
	// Transient teal flash on a word's grid cells when its list row is tapped.
	const [locateCells, setLocateCells] = useState<Set<string>>(new Set());
	const locateClearTimerRef = useRef<number | null>(null);
	const gridRef = useRef<HTMLDivElement>(null);
	const lastPointerPressAtRef = useRef(0);
	const highlightResetTimerRef = useRef<number | null>(null);
	const submitFeedbackIdRef = useRef(0);
	const submitFeedbackResetTimerRef = useRef<number | null>(null);
	const completionTrackedRef = useRef(false);
	const justCompletedRef = useRef(false);
	const completionScheduledRef = useRef(false);
	const completionTransitionTimerRef = useRef<number | null>(null);
	const [displayComplete, setDisplayComplete] = useState(false);
	const [shouldFireConfetti, setShouldFireConfetti] = useState(false);
	const [sharePreviewOpen, setSharePreviewOpen] = useState(false);
	const [welcomeOpen, setWelcomeOpen] = useState(false);
	const firstVisitChecked = useRef(false);
	const [winDialogOpen, setWinDialogOpen] = useState(false);
	const winDialogTimerRef = useRef<number | null>(null);
	const { captureEvent, captureException } = useObservability();
	const { applyLocalEvent, derivedProgress, isProgressReady } =
		useDailyProgress({
			activeUser,
			deviceId,
			initialData,
		});

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			try {
				const [nextAnswers, nextHints] = await Promise.all([
					decodeRevealedAnswers(puzzle, derivedProgress),
					decodeHintLetters(puzzle, derivedProgress),
				]);

				if (!cancelled) {
					setRevealedAnswers(nextAnswers);
					setHintLetters(nextHints);
				}
			} catch (error) {
				console.error("Failed to decode puzzle progress", error);
				captureException(error, {
					puzzle_date: puzzle.dateKey,
					scope: "decode_progress",
				});
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [captureException, derivedProgress, puzzle]);

	useEffect(() => {
		return () => {
			if (highlightResetTimerRef.current != null) {
				window.clearTimeout(highlightResetTimerRef.current);
			}
			if (submitFeedbackResetTimerRef.current != null) {
				window.clearTimeout(submitFeedbackResetTimerRef.current);
			}
			if (completionTransitionTimerRef.current != null) {
				window.clearTimeout(completionTransitionTimerRef.current);
			}
			if (winDialogTimerRef.current != null) {
				window.clearTimeout(winDialogTimerRef.current);
			}
			if (clueGridFadeTimerRef.current != null) {
				window.clearTimeout(clueGridFadeTimerRef.current);
			}
			if (clueGridClearTimerRef.current != null) {
				window.clearTimeout(clueGridClearTimerRef.current);
			}
			if (locateClearTimerRef.current != null) {
				window.clearTimeout(locateClearTimerRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (activeUser) {
			setAnonymousHistoryEntries(initialData.historyEntries ?? []);
			return;
		}

		setAnonymousHistoryEntries(getSortedAnonymousHistoryEntries());
	}, [activeUser, initialData.historyEntries]);

	const openHowToPlayIfFirstVisit = useCallback(() => {
		if (hasSeenHowToPlay()) return;
		markHowToPlaySeen();
		openHowToPlay();
		captureEvent("how_to_play_shown", { trigger: "first_visit" });
	}, [captureEvent]);

	useEffect(() => {
		if (firstVisitChecked.current) return;
		firstVisitChecked.current = true;

		const shouldShowWelcome = !activeUser && !hasSeenWelcome();
		if (shouldShowWelcome) {
			setWelcomeOpen(true);
			captureEvent("welcome_shown", { trigger: "first_visit" });
			return;
		}

		openHowToPlayIfFirstVisit();
	}, [activeUser, captureEvent, openHowToPlayIfFirstVisit]);

	const handleWelcomeOpenChange = useCallback(
		(next: boolean) => {
			setWelcomeOpen(next);
			if (next) return;
			markWelcomeSeen();
			openHowToPlayIfFirstVisit();
		},
		[openHowToPlayIfFirstVisit],
	);

	const handleWelcomeContinueAnonymous = useCallback(() => {
		captureEvent("welcome_dismissed", { choice: "anonymous" });
	}, [captureEvent]);

	useEffect(() => {
		captureEvent("puzzle_loaded", {
			date_key: puzzle.dateKey,
			is_authenticated: Boolean(activeUser),
			puzzle_id: puzzle.id,
			rows: puzzle.rows,
			total_words: totalWords,
		});
	}, [
		activeUser,
		captureEvent,
		puzzle.dateKey,
		puzzle.id,
		puzzle.rows,
		totalWords,
	]);

	useEffect(() => {
		const isComplete = derivedProgress.guessedWordIds.length === totalWords;
		if (!isComplete || completionTrackedRef.current) {
			return;
		}

		completionTrackedRef.current = true;
		captureEvent("puzzle_completed", {
			date_key: puzzle.dateKey,
			guess_count: derivedProgress.guessCount,
			hints_used: derivedProgress.hintsUsed,
			is_authenticated: Boolean(activeUser),
			puzzle_id: puzzle.id,
		});
	}, [
		activeUser,
		captureEvent,
		derivedProgress.guessCount,
		derivedProgress.guessedWordIds.length,
		derivedProgress.hintsUsed,
		puzzle.dateKey,
		puzzle.id,
		totalWords,
	]);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const rolloverAt = new Date(initialData.rolloverAt).getTime();
		const delay = Math.max(1_000, rolloverAt - Date.now());
		const timer = window.setTimeout(() => window.location.reload(), delay);
		const refreshIfExpired = () => {
			if (Date.now() >= rolloverAt) {
				window.location.reload();
			}
		};

		window.addEventListener("focus", refreshIfExpired);
		window.addEventListener("pageshow", refreshIfExpired);
		document.addEventListener("visibilitychange", refreshIfExpired);

		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("focus", refreshIfExpired);
			window.removeEventListener("pageshow", refreshIfExpired);
			document.removeEventListener("visibilitychange", refreshIfExpired);
		};
	}, [initialData.rolloverAt]);

	const revealedCells = useMemo(
		() => buildRevealedCells(puzzle, derivedProgress),
		[puzzle, derivedProgress],
	);

	// The clue-fetch effect reveals fallback letters off the latest progress
	// without re-firing on every reveal; keep the moving parts in a ref so the
	// effect can stay keyed on the requested clue words alone.
	const fallbackContextRef = useRef({ revealedCells, applyLocalEvent, puzzle });
	fallbackContextRef.current = { revealedCells, applyLocalEvent, puzzle };

	const cellLetters = useMemo(
		() => buildCellLetters(puzzle.wordSlots, revealedAnswers, hintLetters),
		[hintLetters, puzzle.wordSlots, revealedAnswers],
	);

	const nextHintCellKey = useMemo(
		() => getNextHintCellKey(puzzle, revealedCells),
		[puzzle, revealedCells],
	);

	// Logged-in players with the flag on get AI text clues; everyone else keeps
	// the single-letter reveal.
	const useTextClue = Boolean(activeUser && aiCluesEnabled);

	const nextClueWordId = useMemo(() => {
		if (!useTextClue) return null;
		const { notFoundSlots } = getSortedWordSlots(
			puzzle.wordSlots,
			derivedProgress.guessedWordIds,
			cellLetters,
		);
		const requested = new Set(derivedProgress.clueWordIds);
		return notFoundSlots.find((slot) => !requested.has(slot.id))?.id ?? null;
	}, [
		useTextClue,
		puzzle.wordSlots,
		derivedProgress.guessedWordIds,
		derivedProgress.clueWordIds,
		cellLetters,
	]);

	// Stable primitive key derived from the requested clue word ids, so the fetch
	// effect refires only when the set actually changes (not on every render that
	// produces a fresh array reference).
	const clueWordIdsKey = derivedProgress.clueWordIds.join(",");

	// Light a clue word's grid ring for a few seconds, then fade it back to the
	// regular cell colors so it reads as a transient cue, not a permanent mark.
	// Only used for words that resolved to a real AI clue — letter fallbacks add
	// the letter without highlighting the word.
	const lightClueWordRing = useCallback(
		(wordId: number) => {
			const clueSlot = puzzle.wordSlots.find((slot) => slot.id === wordId);
			if (!clueSlot) return;

			if (clueGridFadeTimerRef.current != null) {
				window.clearTimeout(clueGridFadeTimerRef.current);
			}
			if (clueGridClearTimerRef.current != null) {
				window.clearTimeout(clueGridClearTimerRef.current);
			}
			setClueGridFading(false);
			setClueGridCells(getWordCellKeys(clueSlot));
			clueGridFadeTimerRef.current = window.setTimeout(() => {
				setClueGridFading(true);
				clueGridFadeTimerRef.current = null;
			}, CLUE_GRID_HIGHLIGHT_MS);
			clueGridClearTimerRef.current = window.setTimeout(() => {
				setClueGridCells(new Set());
				setClueGridFading(false);
				clueGridClearTimerRef.current = null;
			}, CLUE_GRID_HIGHLIGHT_MS + CLUE_GRID_FADE_MS);
		},
		[puzzle.wordSlots],
	);

	useEffect(() => {
		if (!useTextClue || clueWordIdsKey === "") {
			setClueTextsByWordId({});
			return;
		}

		const wordIds = clueWordIdsKey.split(",").map(Number);
		let cancelled = false;
		let timeoutId: number | null = null;

		// For every requested word that has no clue text, silently reveal one of
		// its letters instead. Idempotent: words that already have a revealed cell
		// (e.g. a fallback letter from a previous visit) are skipped, so a reload
		// that refetches and still finds the clue missing won't reveal extra
		// letters.
		const revealFallbackLetters = (cluesByWordId: Record<number, string>) => {
			const {
				revealedCells: currentRevealed,
				applyLocalEvent: apply,
				puzzle: currentPuzzle,
			} = fallbackContextRef.current;
			const revealed = new Set(currentRevealed);

			for (const wordId of wordIds) {
				if (cluesByWordId[wordId]) continue;

				const slot = currentPuzzle.wordSlots.find((item) => item.id === wordId);
				if (!slot) continue;

				// One deterministic letter per word. Skip only when that exact cell is
				// already revealed, so reloads stay idempotent (no extra letters, no
				// duplicate events) without latching onto a crossing word's letter.
				const cellKey = getSlotHintCellKey(currentPuzzle, slot);
				if (!cellKey || revealed.has(cellKey)) continue;

				revealed.add(cellKey);
				apply(createPuzzleEvent("text_hint_fallback", { wordId, cellKey }));
			}
		};

		const timeoutPromise = new Promise<"timeout">((resolve) => {
			timeoutId = window.setTimeout(
				() => resolve("timeout"),
				CLUE_FETCH_TIMEOUT_MS,
			);
		});

		void (async () => {
			try {
				const result = await Promise.race([
					getWordClues({ data: { puzzleId: puzzle.id, wordIds } }),
					timeoutPromise,
				]);
				if (cancelled) return;

				if (result === "timeout") {
					revealFallbackLetters({});
					return;
				}

				setClueTextsByWordId(result);

				// Toast freshly requested clues so the player notices them even if
				// they miss the word list update; reloads add nothing to the pending
				// set, so they don't re-toast old clues.
				const pendingToasts = pendingClueToastWordIdsRef.current;
				for (const wordId of Array.from(pendingToasts)) {
					const clue = result[wordId];
					if (!clue) continue;
					toast("Pista", { description: clue, duration: 10000 });
					lightClueWordRing(wordId);
					pendingToasts.delete(wordId);
				}

				revealFallbackLetters(result);
			} catch (error) {
				if (cancelled) return;
				console.error("Failed to load word clues", error);
				captureException(error, {
					puzzle_date: puzzle.dateKey,
					scope: "load_word_clues",
				});
				revealFallbackLetters({});
			} finally {
				if (timeoutId != null) window.clearTimeout(timeoutId);
			}
		})();

		return () => {
			cancelled = true;
			if (timeoutId != null) window.clearTimeout(timeoutId);
		};
	}, [
		useTextClue,
		puzzle.id,
		puzzle.dateKey,
		clueWordIdsKey,
		captureException,
		lightClueWordRing,
	]);

	// Stable primitive key so the found-clue fetch refires only when the set of
	// found words actually changes, not on every render.
	const guessedWordIdsKey = derivedProgress.guessedWordIds.join(",");

	// Fetch clues for words the player has already found so they can be shown in
	// the list. No toast, no letter fallback, no grid highlight — these are just
	// for reading after the fact. Same availability as requested clues.
	useEffect(() => {
		if (!useTextClue || guessedWordIdsKey === "") {
			setFoundClueTextsByWordId({});
			return;
		}

		const wordIds = guessedWordIdsKey.split(",").map(Number);
		let cancelled = false;

		void (async () => {
			try {
				const result = await getWordClues({
					data: { puzzleId: puzzle.id, wordIds },
				});
				if (cancelled) return;
				setFoundClueTextsByWordId(result);
			} catch (error) {
				if (cancelled) return;
				console.error("Failed to load found word clues", error);
				captureException(error, {
					puzzle_date: puzzle.dateKey,
					scope: "load_found_word_clues",
				});
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [
		useTextClue,
		puzzle.id,
		puzzle.dateKey,
		guessedWordIdsKey,
		captureException,
	]);
	const streakStats = useMemo(() => {
		const baseEntries = activeUser
			? (initialData.historyEntries ?? [])
			: anonymousHistoryEntries;
		const streakEntries = upsertHistoryEntry(
			baseEntries,
			buildHistoryEntry(puzzle, derivedProgress),
		);

		return calculateHistoryStreaks(streakEntries, {
			referenceDateKey: puzzle.dateKey,
		});
	}, [
		activeUser,
		anonymousHistoryEntries,
		derivedProgress,
		initialData.historyEntries,
		puzzle,
	]);

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

	const showSubmitFeedback = useCallback(
		(word: string, kind: DailySubmitFeedback["kind"]) => {
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

	const handleGuess = useCallback(async () => {
		triggerHaptic(HAPTIC_SUBMIT_MS);

		if (!currentGuess.trim()) return;
		const guess = currentGuess.trim();
		const prettyGuess = formatGuess(guess);

		if (!/^[a-zA-ZÀ-ÿçÇ·]+$/.test(guess)) {
			triggerHaptic(HAPTIC_ERROR_PATTERN);
			showSubmitFeedback(prettyGuess, "invalid_input");
			captureEvent("puzzle_guess_result", {
				date_key: puzzle.dateKey,
				guess_length: guess.length,
				matched: false,
				puzzle_id: puzzle.id,
				result_kind: "invalid_input",
			});
			setCurrentGuess("");
			return;
		}

		const result = await resolveGuess({
			puzzle,
			progress: derivedProgress,
			guess,
		});

		showSubmitFeedback(prettyGuess, result.kind);
		captureEvent("puzzle_guess_result", {
			date_key: puzzle.dateKey,
			guess_length: guess.length,
			matched: result.matchedSlotId != null,
			puzzle_id: puzzle.id,
			result_kind: result.kind,
		});

		if (!result.isRepeatGuess) {
			applyLocalEvent(
				createPuzzleEvent("guess_added", {
					guessHash: result.guessHash,
					matchedWordId: result.matchedSlotId,
					unlockToken: result.unlockToken,
				}),
			);
		}

		if (result.kind === "new_word") {
			triggerHaptic(HAPTIC_SUCCESS_PATTERN);
			if (result.matchedSlotId != null) {
				setHighlightedWordId(result.matchedSlotId);
				if (highlightResetTimerRef.current != null) {
					window.clearTimeout(highlightResetTimerRef.current);
				}
				highlightResetTimerRef.current = window.setTimeout(() => {
					setHighlightedWordId((current) =>
						current === result.matchedSlotId ? null : current,
					);
					highlightResetTimerRef.current = null;
				}, 1400);
			}

			if (derivedProgress.guessedWordIds.length + 1 === totalWords) {
				justCompletedRef.current = true;
			}
		} else if (result.kind === "not_in_dictionary") {
			triggerHaptic(HAPTIC_ERROR_PATTERN);
		}

		setCurrentGuess("");
	}, [
		applyLocalEvent,
		captureEvent,
		currentGuess,
		derivedProgress,
		puzzle,
		showSubmitFeedback,
		totalWords,
		triggerHaptic,
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
		captureEvent("puzzle_letters_shuffled", {
			date_key: puzzle.dateKey,
			puzzle_id: puzzle.id,
		});
		applyLocalEvent(
			createPuzzleEvent("letters_shuffled", {
				shuffledLetters,
			}),
		);
	}, [
		applyLocalEvent,
		captureEvent,
		derivedProgress.shuffledLetters,
		puzzle.dateKey,
		puzzle.id,
		triggerHaptic,
	]);

	const handleHint = useCallback(() => {
		triggerHaptic(HAPTIC_TAP_MS);
		if (derivedProgress.hintsUsed >= 3) return;

		if (useTextClue) {
			if (nextClueWordId == null) return;
			captureEvent("puzzle_text_hint_requested", {
				date_key: puzzle.dateKey,
				hints_used_after: derivedProgress.hintsUsed + 1,
				puzzle_id: puzzle.id,
				word_id: nextClueWordId,
			});
			applyLocalEvent(
				createPuzzleEvent("text_hint_requested", {
					wordId: nextClueWordId,
				}),
			);
			pendingClueToastWordIdsRef.current.add(nextClueWordId);
			// The grid ring is lit only once the clue text resolves (see the
			// clue-fetch effect); a letter fallback adds the letter without it.
			return;
		}

		if (!nextHintCellKey) return;
		captureEvent("puzzle_hint_used", {
			date_key: puzzle.dateKey,
			hints_used_after: derivedProgress.hintsUsed + 1,
			puzzle_id: puzzle.id,
		});
		applyLocalEvent(
			createPuzzleEvent("hint_used", {
				cellKey: nextHintCellKey,
			}),
		);
	}, [
		applyLocalEvent,
		captureEvent,
		derivedProgress.hintsUsed,
		nextClueWordId,
		nextHintCellKey,
		puzzle.dateKey,
		puzzle.id,
		triggerHaptic,
		useTextClue,
	]);

	// Peer clue requests: a logged-in player who is out of hints can ask other
	// connected players for a clue about a specific unfound word.
	const canRequestHelp =
		Boolean(activeUser) &&
		peerCluesEnabled &&
		derivedProgress.hintsUsed >= 3 &&
		derivedProgress.guessedWordIds.length < totalWords;

	const handleRequestHelp = useCallback(
		(wordId: number) => {
			triggerHaptic(HAPTIC_TAP_MS);
			setRequestedHelpWordIds((current) =>
				current.includes(wordId) ? current : [...current, wordId],
			);
			captureEvent("peer_clue_requested", {
				date_key: puzzle.dateKey,
				puzzle_id: puzzle.id,
				word_id: wordId,
			});
			void requestClue(wordId).then((created) => {
				if (!created) {
					// Couldn't register the request (e.g. no other players / offline);
					// drop the pending state so the button is actionable again.
					setRequestedHelpWordIds((current) =>
						current.filter((id) => id !== wordId),
					);
					toast.error("No s'ha pogut demanar ajuda");
				}
			});
		},
		[captureEvent, puzzle.dateKey, puzzle.id, requestClue, triggerHaptic],
	);

	// Receive clues sent by other players and surface them under the word.
	useEffect(() => {
		const unsubscribe = subscribeClueRequests((event) => {
			if (event.type !== "response") return;
			const { wordId, text, responderName } = event.response;
			setPeerClueTextsByWordId((current) => ({ ...current, [wordId]: text }));
			toast(`Pista de ${responderName}`, {
				description: text,
				duration: 12000,
			});
		});
		return unsubscribe;
	}, [subscribeClueRequests]);

	// Tapping an incomplete word flashes its grid cells in off-white teal so the
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

	const isComplete = derivedProgress.guessedWordIds.length === totalWords;

	// Delay the visual completion state so the submit feedback animation plays first
	useEffect(() => {
		if (!isComplete || completionScheduledRef.current) return;
		completionScheduledRef.current = true;

		if (justCompletedRef.current) {
			// User just guessed the last word — wait for the feedback animation
			justCompletedRef.current = false;
			completionTransitionTimerRef.current = window.setTimeout(() => {
				setDisplayComplete(true);
				setShouldFireConfetti(true);
				completionTransitionTimerRef.current = null;
				// Let confetti land before the modal pops up.
				winDialogTimerRef.current = window.setTimeout(() => {
					setWinDialogOpen(true);
					winDialogTimerRef.current = null;
				}, 900);
			}, getSubmitFeedbackDuration());
		} else {
			// Puzzle was already complete on load — show immediately, no confetti
			setDisplayComplete(true);
		}
	}, [isComplete]);

	const signInWithGoogle = useCallback(
		async (source: string) => {
			captureEvent("auth_sign_in_started", {
				provider: "google",
				source,
			});
			try {
				await authClient.signIn.social({
					provider: "google",
					callbackURL: window.location.href,
				});
			} catch (error) {
				captureException(error, { scope: `${source}_sign_in` });
				toast.error("No s'ha pogut iniciar la sessió");
			}
		},
		[captureEvent, captureException],
	);

	const handleWelcomeSignIn = useCallback(() => {
		captureEvent("welcome_dismissed", { choice: "google" });
		markWelcomeSeen();
		setWelcomeOpen(false);
		void signInWithGoogle("welcome_dialog");
	}, [captureEvent, signInWithGoogle]);

	const completionStats = useMemo(() => {
		if (derivedProgress.guessedWordIds.length !== totalWords) return undefined;
		return {
			guessCount: derivedProgress.guessCount,
			hintsUsed: derivedProgress.hintsUsed,
			completedAt: derivedProgress.completedAt,
			currentStreak: streakStats.currentStreak,
		};
	}, [
		derivedProgress.completedAt,
		derivedProgress.guessCount,
		derivedProgress.guessedWordIds.length,
		derivedProgress.hintsUsed,
		streakStats.currentStreak,
		totalWords,
	]);

	const handleShare = useCallback(async () => {
		try {
			const result = await shareProgress(
				puzzle,
				revealedCells,
				derivedProgress.guessedWordIds.length,
				totalWords,
				completionStats,
			);
			if (result === "copied") {
				toast.success("Imatge copiada!");
			}
		} catch {
			toast.error("No s'ha pogut compartir");
		}
	}, [
		completionStats,
		puzzle,
		revealedCells,
		derivedProgress.guessedWordIds.length,
		totalWords,
	]);

	useEffect(() => {
		if (typeof window === "undefined" || isComplete) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.defaultPrevented ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				isEditableTarget(event.target)
			) {
				return;
			}

			const action = getGuessKeyboardAction(
				event.key,
				derivedProgress.shuffledLetters,
				event.code,
			);
			if (!action) {
				return;
			}

			if (action.type === "submit") {
				if (event.repeat || currentGuess.trim().length < 4) {
					return;
				}

				event.preventDefault();
				void handleGuess();
				return;
			}

			if (action.type === "backspace") {
				if (currentGuess.length === 0) {
					return;
				}

				event.preventDefault();
				handleBackspace();
				return;
			}

			event.preventDefault();
			handleLetterClick(action.letter);
		};

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		currentGuess,
		derivedProgress.shuffledLetters,
		handleBackspace,
		handleGuess,
		handleLetterClick,
		isComplete,
	]);

	if (!isProgressReady) {
		return <DailyProgressLoadingState />;
	}

	return (
		<>
			<DailyConfetti fire={shouldFireConfetti} />
			<div
				className={`min-h-full px-3 sm:px-4 lg:px-8 pt-2 sm:pt-3 lg:pt-4 ${
					displayComplete
						? "pb-6 sm:pb-8 lg:pb-24"
						: "pb-[calc(21rem+env(safe-area-inset-bottom))] sm:pb-[calc(21rem+env(safe-area-inset-bottom))] lg:pb-24"
				}`}
			>
				<div className="max-w-5xl mx-auto">
					<div
						className={`mb-4 sm:mb-6 ${displayComplete ? "pt-2 sm:pt-0" : ""}`}
					>
						{displayComplete ? (
							<div className="space-y-1">
								<p className="text-sm font-medium text-muted-foreground font-ui">
									Felicitats!
								</p>
								<h2 className="text-xl font-semibold tracking-tight">
									Has completat el joc
								</h2>
								<div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm font-medium text-muted-foreground font-ui">
									<span>
										{derivedProgress.guessCount} intent
										{derivedProgress.guessCount === 1 ? "" : "s"}
									</span>
									<span>
										{derivedProgress.hintsUsed === 1
											? `${derivedProgress.hintsUsed} pista`
											: `${derivedProgress.hintsUsed} pistes`}
									</span>
									{streakStats.currentStreak >= 3 ? (
										<span>Ratxa: {streakStats.currentStreak} dies 🔥</span>
									) : null}
									<Button
										variant="ghost"
										size="sm"
										className="gap-1.5 h-7 px-2 ml-auto"
										onClick={() => void handleShare()}
									>
										<Share2 className="w-3.5 h-3.5" />
										Compartir
									</Button>
								</div>
							</div>
						) : (
							(() => {
								const percent = Math.min(
									100,
									Math.max(
										0,
										(derivedProgress.guessedWordIds.length / totalWords) * 100,
									),
								);
								return (
									<div className="flex items-center gap-1.5">
										<div
											className="relative h-8 flex-1 overflow-hidden rounded-full bg-muted/40"
											role="progressbar"
											aria-valuenow={derivedProgress.guessedWordIds.length}
											aria-valuemin={0}
											aria-valuemax={totalWords}
											aria-label="Paraules trobades"
										>
											<div
												className="absolute inset-y-0 left-0 rounded-full bg-primary/15 transition-[width] duration-500 ease-out"
												style={{ width: `${percent}%` }}
											/>
											<div className="relative flex h-full items-center justify-between gap-3 px-3 text-xs font-semibold font-ui">
												<span className="flex items-baseline gap-1">
													<span className="text-foreground tabular-nums text-sm">
														{derivedProgress.guessedWordIds.length}
													</span>
													<span className="text-muted-foreground/50">/</span>
													<span className="text-muted-foreground tabular-nums">
														{totalWords}
													</span>
													<span className="ml-1 hidden text-muted-foreground sm:inline">
														paraules
													</span>
												</span>
												<span className="text-muted-foreground tabular-nums">
													{derivedProgress.guessCount}{" "}
													{derivedProgress.guessCount === 1
														? "intent"
														: "intents"}
												</span>
											</div>
										</div>
										<Button
											variant="ghost"
											size="icon"
											className="size-8 shrink-0 rounded-full border border-border/50 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
											onClick={() => {
												if (getSkipSharePreview()) {
													void handleShare();
												} else {
													setSharePreviewOpen(true);
												}
											}}
											aria-label="Compartir progrés"
										>
											<Share2 className="size-3.5" />
										</Button>
									</div>
								);
							})()
						)}
					</div>

					<div className="lg:grid lg:grid-cols-[1fr_18rem] lg:gap-8 xl:grid-cols-[1fr_20rem]">
						<div ref={gridRef}>
							<DailyGrid
								puzzle={puzzle}
								revealedCells={revealedCells}
								cellLetters={cellLetters}
								highlightedWordId={highlightedWordId}
								clueCells={clueGridCells}
								clueCellsFading={clueGridFading}
								locateCells={locateCells}
							/>
						</div>

						<div className="mt-6 lg:mt-0 lg:space-y-6">
							<DailyControls
								aiClueMode={useTextClue}
								circleLetters={circleLetters}
								canUseHint={
									derivedProgress.hintsUsed < 3 &&
									(useTextClue
										? nextClueWordId != null
										: nextHintCellKey != null)
								}
								currentGuess={currentGuess}
								hintsUsed={derivedProgress.hintsUsed}
								isComplete={displayComplete}
								shuffledLetters={derivedProgress.shuffledLetters}
								onBackspace={handleBackspace}
								onHint={handleHint}
								onLetterClick={handleLetterClick}
								onShuffle={handleShuffle}
								onSubmitGuess={() => {
									void handleGuess();
								}}
								submitFeedback={submitFeedback}
								runClickAction={runClickAction}
								runPressAction={runPressAction}
							/>

							<div>
								<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 font-ui">
									Paraules ({derivedProgress.guessedWordIds.length}/{totalWords}
									)
								</h3>
								<DailyWordList
									puzzle={puzzle}
									guessedWordIds={derivedProgress.guessedWordIds}
									revealedAnswers={revealedAnswers}
									cellLetters={cellLetters}
									clueTextsByWordId={clueTextsByWordId}
									clueWordIds={derivedProgress.clueWordIds}
									foundClueTextsByWordId={foundClueTextsByWordId}
									onWordTap={handleLocateWord}
									canRequestHelp={canRequestHelp}
									requestedHelpWordIds={requestedHelpWordIds}
									peerClueTextsByWordId={peerClueTextsByWordId}
									onRequestHelp={handleRequestHelp}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
			<WelcomeDialog
				open={welcomeOpen}
				onOpenChange={handleWelcomeOpenChange}
				onSignIn={handleWelcomeSignIn}
				onContinueAnonymous={handleWelcomeContinueAnonymous}
			/>
			<SharePreviewDialog
				open={sharePreviewOpen}
				onOpenChange={setSharePreviewOpen}
				puzzle={puzzle}
				revealedCells={revealedCells}
				guessedCount={derivedProgress.guessedWordIds.length}
				totalWords={totalWords}
				completionStats={completionStats}
				onConfirm={() => {
					setSharePreviewOpen(false);
					void handleShare();
				}}
			/>
			<WinDialog
				open={winDialogOpen}
				onOpenChange={setWinDialogOpen}
				guessCount={derivedProgress.guessCount}
				hintsUsed={derivedProgress.hintsUsed}
				completedAt={derivedProgress.completedAt}
				currentStreak={streakStats.currentStreak}
				isAnonymous={!activeUser}
				onShare={() => {
					setWinDialogOpen(false);
					void handleShare();
				}}
				onSignIn={() => {
					void signInWithGoogle("win_dialog");
				}}
			/>
		</>
	);
}

function DailyProgressLoadingState() {
	return (
		<div className="min-h-full px-3 pt-4 pb-[calc(21rem+env(safe-area-inset-bottom))] sm:px-4 sm:pt-6 sm:pb-[calc(21rem+env(safe-area-inset-bottom))] lg:px-8 lg:pt-8 lg:pb-24">
			<div className="mx-auto max-w-5xl">
				<div className="flex min-h-[calc(100svh-14rem)] items-center justify-center">
					<div className="flex max-w-sm flex-col items-center gap-4 rounded-3xl border border-border/70 bg-background/90 px-6 py-8 text-center shadow-sm backdrop-blur-sm">
						<div className="rounded-full border border-primary/20 bg-primary/10 p-3 text-primary">
							<Loader2Icon className="size-6 animate-spin" />
						</div>
						<div className="space-y-1.5">
							<p className="text-sm font-semibold tracking-[0.16em] text-primary/70 uppercase font-ui">
								Carregant
							</p>
							<h2 className="text-lg font-semibold tracking-tight">
								Recuperant el teu progrés
							</h2>
							<p className="text-sm text-muted-foreground">
								Estem restaurant les paraules trobades i les pistes
								d&apos;aquesta partida.
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
