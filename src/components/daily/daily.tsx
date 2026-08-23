import { Loader2Icon } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { openProfilePreferencesTip } from "@/components/profile-preferences-tip-store";
import {
	getBonusCluesEnabled,
	getLetterLayout,
	getSkipSharePreview,
	isVibrationEnabled,
	type LetterLayout,
} from "@/lib/anon-identity";
import { authClient } from "@/lib/auth-client";
import { WORD_LIST_SECTION_ID } from "@/lib/clue-request-types";
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
	hasSeenProfilePreferencesTip,
	hasSeenWelcome,
	markHowToPlaySeen,
	markProfilePreferencesTipSeen,
	markWelcomeSeen,
} from "@/lib/puzzle-local";
import { getWordClues } from "@/lib/puzzle-server-fns";
import {
	calculateHistoryStreaks,
	upsertHistoryEntry,
} from "@/lib/puzzle-streaks";
import { formatGuess, getPlayableWordLetters } from "@/lib/puzzle-text";
import { WORDS_PER_BONUS_CLUE } from "@/lib/puzzle-types";
import { shuffleArray } from "@/lib/shuffle";
import { useActiveSessionUser } from "@/lib/use-active-session-user";
import { useClueRequests } from "@/lib/use-clue-requests";
import { useObservability } from "@/lib/use-observability";
import { DailyConfetti } from "./daily-confetti";
import { DailyControls } from "./daily-controls";
import {
	buildFlyingLetterPaths,
	DailyFlyingLetters,
	type FlyingLettersAnimation,
	GRID_GUESS_BOUNCE_MS,
	getWordCellKeysInOrder,
	HIGHLIGHT_AFTER_LAND_MS,
} from "./daily-flying-letters";
import { DailyGrid } from "./daily-grid";
import { setDailyHeaderSummary } from "./daily-header-store";
import {
	buildCellLetters,
	buildHistoryEntry,
	buildRevealedCells,
	getGuessKeyboardAction,
	getRandomHintCellKey,
	getSlotCellKey,
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
// Room the classic keypad claims until it has reported its real height: roughly
// the circle arrangement, which is what the server renders. Only the first
// paint uses it, and only the board's size depends on it.
const CLASSIC_KEYPAD_FALLBACK_HEIGHT = "17rem";
// Number of valid off-puzzle words the player must find to earn a free letter reveal.
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

// The width at which the board switches to its two-column desktop layout,
// where the keypad lives in a narrow side column. Matches the `lg:` breakpoint
// the classic layout is built on.
const DESKTOP_LAYOUT_QUERY = "(min-width: 1024px)";

// Starts false so the server and the first client render agree; the real value
// lands right after mount, before anything the player can act on.
function useIsDesktopLayout(): boolean {
	const [isDesktop, setIsDesktop] = useState(false);

	useEffect(() => {
		if (typeof window.matchMedia !== "function") {
			return;
		}

		const mediaQuery = window.matchMedia(DESKTOP_LAYOUT_QUERY);
		const update = () => setIsDesktop(mediaQuery.matches);

		update();
		mediaQuery.addEventListener("change", update);
		return () => mediaQuery.removeEventListener("change", update);
	}, []);

	return isDesktop;
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
	const isDesktopLayout = useIsDesktopLayout();
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
	// A player can opt into any of the three arrangements via /preferencies.
	// Initialise to the default so SSR markup is deterministic, then read the
	// stored choice after mount.
	const [letterLayout, setLetterLayout] = useState<LetterLayout>("circle");
	useEffect(() => {
		setLetterLayout(getLetterLayout());
	}, []);
	// The line only fits the phone keypad; on a desktop the keys live in a narrow
	// side column, so a seven-across row falls back to the grid.
	const effectiveLetterLayout: LetterLayout =
		letterLayout === "line" && isDesktopLayout ? "grid" : letterLayout;
	const {
		subscribe: subscribeClueRequests,
		requestClue,
		resolveClue,
		incomingRequests,
		respondToClue,
		helpGivenRecords,
		receivedClues,
		requestedHelpWordIds,
		publishSolvedWordIds,
	} = useClueRequests();
	// Clues delivered by other players (receivedClues) and the words this player
	// asked help for (requestedHelpWordIds) both live in the provider so they
	// persist across SSE reconnects and page reloads (replayed in the snapshot).
	// Each response carries the responder's name so we can attribute the clue.
	const [submitFeedback, setSubmitFeedback] =
		useState<DailySubmitFeedback | null>(null);
	// Bonus clues for valid off-puzzle words (default on; off = hardcore mode).
	// Read from localStorage on mount, so SSR renders the default first.
	const [bonusCluesEnabled, setBonusCluesEnabled] = useState(true);
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
	// Height of the keypad pinned to the bottom of the classic board. Measured
	// rather than assumed: which arrangement the letters use is a preference, and
	// each one is a different height.
	const [keypadHeight, setKeypadHeight] = useState<number | null>(null);
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
	// Once the day rolls over we swap the rendered tree to a loading state before
	// reloading, so a backgrounded PWA never flashes yesterday's puzzle on resume.
	const [isRollingOver, setIsRollingOver] = useState(false);
	const [sharePreviewOpen, setSharePreviewOpen] = useState(false);
	const [welcomeOpen, setWelcomeOpen] = useState(false);
	const firstVisitChecked = useRef(false);
	const [winDialogOpen, setWinDialogOpen] = useState(false);
	const winDialogTimerRef = useRef<number | null>(null);
	const { captureEvent, captureException } = useObservability();
	const captureExceptionRef = useRef(captureException);
	captureExceptionRef.current = captureException;
	// Lets the header's share button reach the latest handler without making the
	// published summary churn on every render.
	const handleShareRef = useRef<() => Promise<void>>(async () => {});
	const { applyLocalEvent, derivedProgress } = useDailyProgress({
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
					setRevealedAnswers((current) =>
						JSON.stringify(current) === JSON.stringify(nextAnswers)
							? current
							: nextAnswers,
					);
					setHintLetters((current) =>
						JSON.stringify(current) === JSON.stringify(nextHints)
							? current
							: nextHints,
					);
				}
			} catch (error) {
				console.error("Failed to decode puzzle progress", error);
				captureExceptionRef.current(error, {
					puzzle_date: puzzle.dateKey,
					scope: "decode_progress",
				});
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [derivedProgress, puzzle]);

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
			for (const timer of bounceClearTimersRef.current.values()) {
				window.clearTimeout(timer);
			}
			bounceClearTimersRef.current.clear();
		};
	}, []);

	useEffect(() => {
		setBonusCluesEnabled(getBonusCluesEnabled());
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

	const openProfilePreferencesTipIfNeeded = useCallback(() => {
		if (!hasSeenHowToPlay()) return;
		if (hasSeenProfilePreferencesTip()) return;
		markProfilePreferencesTipSeen();
		openProfilePreferencesTip();
		captureEvent("profile_preferences_tip_shown", { trigger: "return_visit" });
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

		if (!hasSeenHowToPlay()) {
			openHowToPlayIfFirstVisit();
			return;
		}

		openProfilePreferencesTipIfNeeded();
	}, [
		activeUser,
		captureEvent,
		openHowToPlayIfFirstVisit,
		openProfilePreferencesTipIfNeeded,
	]);

	const handleWelcomeOpenChange = useCallback(
		(next: boolean) => {
			setWelcomeOpen(next);
			if (next) return;
			markWelcomeSeen();
			if (!hasSeenHowToPlay()) {
				openHowToPlayIfFirstVisit();
				return;
			}
			openProfilePreferencesTipIfNeeded();
		},
		[openHowToPlayIfFirstVisit, openProfilePreferencesTipIfNeeded],
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
		// Don't reload straight from the visibility/focus handler: that keeps the
		// stale puzzle painted for the whole reload round-trip. Flip to the loading
		// state first (see the reload effect below) so the old day is hidden at once.
		const beginRollover = () => setIsRollingOver(true);
		const timer = window.setTimeout(beginRollover, delay);
		const refreshIfExpired = () => {
			if (Date.now() >= rolloverAt) {
				beginRollover();
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

	// Reload only after the loading state has painted, so the resumed PWA shows the
	// spinner instead of yesterday's puzzle while the new day's data is fetched.
	useEffect(() => {
		if (!isRollingOver || typeof window === "undefined") return;

		const frame = window.requestAnimationFrame(() => window.location.reload());
		return () => window.cancelAnimationFrame(frame);
	}, [isRollingOver]);

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

	const nextClueWordId = useMemo(() => {
		const { notFoundSlots } = getSortedWordSlots(
			puzzle.wordSlots,
			derivedProgress.guessedWordIds,
			cellLetters,
		);
		const requested = new Set(derivedProgress.clueWordIds);
		const candidates = notFoundSlots.filter((slot) => !requested.has(slot.id));
		if (candidates.length === 0) return null;
		const choice = candidates[Math.floor(Math.random() * candidates.length)];
		return choice?.id ?? null;
	}, [
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
		if (clueWordIdsKey === "") {
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
		puzzle.id,
		puzzle.dateKey,
		clueWordIdsKey,
		captureException,
		lightClueWordRing,
	]);

	// Stable primitive key so the found-clue fetch refires only when the set of
	// found words actually changes, not on every render.
	const guessedWordIdsKey = derivedProgress.guessedWordIds.join(",");

	// Tell the clue-requests context which words we've solved so it can hide
	// incoming help requests (badge + list) for words we haven't found yet.
	useEffect(() => {
		const wordIds =
			guessedWordIdsKey === "" ? [] : guessedWordIdsKey.split(",").map(Number);
		publishSolvedWordIds(wordIds);
	}, [publishSolvedWordIds, guessedWordIdsKey]);

	// Fetch clues for words the player has already found so they can be shown in
	// the list. No toast, no letter fallback, no grid highlight — these are just
	// for reading after the fact. Same availability as requested clues.
	useEffect(() => {
		if (guessedWordIdsKey === "") {
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
	}, [puzzle.id, puzzle.dateKey, guessedWordIdsKey, captureException]);
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
					captureEvent("bonus_clue_granted", {
						bonus_words_found: nextBonusCount,
						date_key: puzzle.dateKey,
						puzzle_id: puzzle.id,
					});
					toast.success("Pista desbloquejada!", {
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
				justCompletedRef.current = true;
			}
		} else if (result.kind === "not_in_dictionary") {
			triggerHaptic(HAPTIC_ERROR_PATTERN);
		}

		setCurrentGuess("");
	}, [
		applyLocalEvent,
		bonusCluesEnabled,
		captureEvent,
		cellLetters,
		currentGuess,
		derivedProgress,
		puzzle,
		revealedCells,
		showSubmitFeedback,
		totalWords,
		triggerFlyingLetters,
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
	}, [
		applyLocalEvent,
		captureEvent,
		derivedProgress.hintsUsed,
		nextClueWordId,
		puzzle.dateKey,
		puzzle.id,
		triggerHaptic,
	]);

	// Self-serve hint availability: a hint remains in the budget AND there's an
	// unclued missing word to target.
	const canUseSelfHint =
		derivedProgress.hintsUsed < 3 && nextClueWordId != null;

	// Peer clue requests: ask other connected players for a clue about an unfound
	// word once self-serve hints can't help — either the 3-hint budget is spent,
	// or every missing word already has a clue so a remaining hint can't be spent
	// on a new one.
	const canRequestHelp =
		derivedProgress.guessedWordIds.length < totalWords && !canUseSelfHint;

	const handleRequestHelp = useCallback(
		(wordId: number) => {
			triggerHaptic(HAPTIC_TAP_MS);
			captureEvent("peer_clue_requested", {
				date_key: puzzle.dateKey,
				puzzle_id: puzzle.id,
				word_id: wordId,
			});
			// Tell responders whether this player already unlocked the word's AI
			// clue, so they know copying it back into a reply wouldn't help.
			const hasAiClue = derivedProgress.clueWordIds.includes(wordId);
			// The provider tracks the pending state (optimistic add + rollback on
			// failure); here we only surface the failure to the player.
			void requestClue(wordId, hasAiClue).then((created) => {
				if (!created) {
					toast.error("No s'ha pogut demanar ajuda");
				}
			});
		},
		[
			captureEvent,
			derivedProgress.clueWordIds,
			puzzle.dateKey,
			puzzle.id,
			requestClue,
			triggerHaptic,
		],
	);

	// Toast clues as they arrive live. The clue itself is stored in the provider
	// (and replayed in the snapshot), so display doesn't depend on this firing.
	useEffect(() => {
		const unsubscribe = subscribeClueRequests((event) => {
			if (event.type !== "response") return;
			const { text, responderName } = event.response;
			toast(`Pista de ${responderName}`, {
				description: text,
				duration: 12000,
			});
		});
		return unsubscribe;
	}, [subscribeClueRequests]);

	// Once the asker finds a word they'd asked help for, the request is no longer
	// needed: resolve it so other players' badges/buttons clear. resolveClue also
	// drops the word from the provider's "waiting" state.
	useEffect(() => {
		const found = requestedHelpWordIds.filter((wordId) =>
			derivedProgress.guessedWordIds.includes(wordId),
		);
		if (found.length === 0) return;
		for (const wordId of found) {
			void resolveClue(wordId);
		}
	}, [derivedProgress.guessedWordIds, requestedHelpWordIds, resolveClue]);

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

	const openShare = useCallback(() => {
		if (getSkipSharePreview()) {
			void handleShareRef.current();
			return;
		}
		setSharePreviewOpen(true);
	}, []);

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

	// Kept current every render: the header's share button reaches the handler
	// through this ref, and openShare is published to the header only once.
	handleShareRef.current = handleShare;

	// The header (rendered above this route) owns the share button, so it needs
	// a way to reach the board's share handler.
	useEffect(() => {
		setDailyHeaderSummary({ onShare: openShare });
	}, [openShare]);

	useEffect(() => () => setDailyHeaderSummary(null), []);

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

	if (isRollingOver) {
		return <DailyRolloverLoadingState />;
	}

	const keypadHeightCss =
		keypadHeight == null ? CLASSIC_KEYPAD_FALLBACK_HEIGHT : `${keypadHeight}px`;

	const completionSummary = (
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
			</div>
		</div>
	);

	return (
		<>
			<DailyConfetti fire={shouldFireConfetti} />
			<DailyFlyingLetters
				animation={flyingLettersAnimation}
				onLetterLand={handleFlyingLetterLand}
				onComplete={() => {
					const pending = pendingFlyCompleteRef.current;
					if (!pending) {
						return;
					}
					finishFlyingLettersCleanup();
				}}
			/>
			<div
				// h-full, not min-h-full: the word list below the fold overflows this
				// box on purpose, so the board above it can be sized against the room
				// the viewport really has.
				className="h-full px-3 sm:px-4 lg:flex lg:min-h-0 lg:flex-col lg:px-8 pt-2 sm:pt-3 lg:pt-4 lg:pb-8"
				style={{ "--daily-keypad-h": keypadHeightCss } as CSSProperties}
			>
				<div className="mx-auto h-full w-full max-w-5xl lg:grid lg:h-auto lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_18rem] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-x-8 xl:grid-cols-[1fr_20rem]">
					{/* Above the fold: the meters and the board split the room left
					    between the header and the keypad pinned to the bottom, so the
					    board never pushes the word list around and never spills past
					    the keypad. On a desktop this dissolves into the two-column
					    grid, where the keypad sits in the flow of the right column. */}
					<div className="flex h-[calc(100%_-_var(--daily-keypad-h))] flex-col lg:contents">
						<div
							className={`mb-4 shrink-0 sm:mb-6 lg:col-span-2 lg:row-start-1 ${displayComplete ? "pt-2 sm:pt-0" : ""}`}
						>
							{displayComplete
								? completionSummary
								: (() => {
										const percent = Math.min(
											100,
											Math.max(
												0,
												(derivedProgress.guessedWordIds.length / totalWords) *
													100,
											),
										);
										// Bottom meter fills 0→WORDS_PER_BONUS_CLUE toward the next bonus
										// clue and resets each time one is earned; the label keeps the total.
										const bonusCount = derivedProgress.bonusWordsFound;
										const bonusInCycle = bonusCount % WORDS_PER_BONUS_CLUE;
										const bonusPercent =
											(bonusInCycle / WORDS_PER_BONUS_CLUE) * 100;
										const wordsToNextClue = WORDS_PER_BONUS_CLUE - bonusInCycle;
										const meterHeight = bonusCluesEnabled ? "h-6" : "h-7";
										return (
											<div className="flex flex-col gap-1">
												<div
													className={`relative ${meterHeight} overflow-hidden rounded-full bg-muted/40`}
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
													<div className="relative flex h-full items-center justify-between gap-2 px-2.5 text-[11px] font-semibold font-ui">
														<span className="flex items-baseline gap-1">
															<span className="text-foreground tabular-nums text-xs">
																{derivedProgress.guessedWordIds.length}
															</span>
															<span className="text-muted-foreground/50">
																/
															</span>
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
												{bonusCluesEnabled ? (
													<div
														className="relative h-6 overflow-hidden rounded-full bg-blue-500/10 dark:bg-blue-400/10"
														role="progressbar"
														aria-valuenow={bonusInCycle}
														aria-valuemin={0}
														aria-valuemax={WORDS_PER_BONUS_CLUE}
														aria-label="Paraules vàlides de fora del joc"
													>
														<div
															className="absolute inset-y-0 left-0 rounded-full bg-blue-500/25 transition-[width] duration-500 ease-out"
															style={{ width: `${bonusPercent}%` }}
														/>
														<div className="relative flex h-full items-center justify-between gap-2 px-2.5 text-[11px] font-semibold font-ui">
															<span className="flex items-baseline gap-1">
																<span className="tabular-nums text-xs text-blue-700 dark:text-blue-300">
																	{bonusCount}
																</span>
																<span className="ml-1 hidden text-blue-700/70 dark:text-blue-300/70 sm:inline">
																	paraules extra
																</span>
															</span>
															<span className="tabular-nums text-blue-700/70 dark:text-blue-300/70">
																{wordsToNextClue} per a una pista
															</span>
														</div>
													</div>
												) : null}
											</div>
										);
									})()}
						</div>

						<div
							ref={gridRef}
							className="flex min-h-0 flex-1 flex-col pb-2 lg:col-start-1 lg:row-start-2 lg:pb-8"
						>
							<DailyGrid
								fitHeight
								puzzle={puzzle}
								revealedCells={revealedCells}
								cellLetters={cellLetters}
								highlightedWordId={highlightedWordId}
								animatingWordId={animatingWordId}
								animatingPreExistingLetters={animatingPreExistingLetters}
								landedAnimatingCells={landedAnimatingCells}
								bounceCells={bounceCells}
								clueCells={clueGridCells}
								clueCellsFading={clueGridFading}
								locateCells={locateCells}
							/>
						</div>
					</div>

					<div className="mt-6 flex min-h-0 flex-col gap-6 lg:col-start-2 lg:row-start-2 lg:mt-0 lg:h-full lg:min-h-0">
						<DailyControls
							aiClueMode
							layout={effectiveLetterLayout}
							canUseHint={canUseSelfHint}
							currentGuess={currentGuess}
							hintsUsed={derivedProgress.hintsUsed}
							isComplete={displayComplete}
							onHeightChange={setKeypadHeight}
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

						{/* The keypad floats over the bottom of the page, so the last
						    rows need room to clear it. */}
						<div
							id={WORD_LIST_SECTION_ID}
							className={`scroll-mt-4 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:pb-0 ${
								displayComplete
									? "pb-6"
									: "pb-[calc(var(--daily-keypad-h)_+_1rem)]"
							}`}
						>
							<h3 className="mb-3 shrink-0 text-sm font-semibold text-muted-foreground uppercase tracking-wider font-ui">
								Paraules ({derivedProgress.guessedWordIds.length}/{totalWords})
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
								peerCluesByWordId={receivedClues}
								onRequestHelp={handleRequestHelp}
								incomingRequests={incomingRequests}
								helpGivenRecords={helpGivenRecords}
								onRespondToClue={respondToClue}
							/>
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
				onSignIn={() => {
					void signInWithGoogle("win_dialog");
				}}
			/>
		</>
	);
}

function DailyRolloverLoadingState() {
	return (
		<div className="relative overflow-hidden">
			<div className="absolute inset-x-0 top-0 h-40 bg-linear-to-b from-primary/12 to-transparent" />
			<div className="mx-auto flex min-h-[calc(100svh-6rem)] max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
				<div className="rounded-full border border-primary/20 bg-primary/10 p-4 text-primary shadow-sm">
					<Loader2Icon className="size-8 animate-spin" />
				</div>
				<div className="space-y-2">
					<h2 className="text-2xl font-semibold tracking-tight">
						Carregant el repte d'avui
					</h2>
					<p className="max-w-md text-sm text-muted-foreground sm:text-base">
						Ha començat un nou dia. Preparant el trencaclosques d'avui.
					</p>
				</div>
			</div>
		</div>
	);
}
