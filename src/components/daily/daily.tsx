import { Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	createPuzzleEvent,
	decodeHintLetters,
	decodeRevealedAnswers,
	resolveGuess,
} from "@/lib/puzzle-client";
import {
	getDeviceId,
	getSortedAnonymousHistoryEntries,
} from "@/lib/puzzle-local";
import {
	calculateHistoryStreaks,
	upsertHistoryEntry,
} from "@/lib/puzzle-streaks";
import { formatGuess } from "@/lib/puzzle-text";
import { shuffleArray } from "@/lib/shuffle";
import { useActiveSessionUser } from "@/lib/use-active-session-user";
import { useObservability } from "@/lib/use-observability";
import { DailyControls } from "./daily-controls";
import { DailyGrid } from "./daily-grid";
import {
	buildCellLetters,
	buildHistoryEntry,
	buildRevealedCells,
	getGuessKeyboardAction,
	getNextHintCellKey,
} from "./daily-helpers";
import type { DailyData } from "./daily-types";
import { DailyWordList } from "./daily-word-list";
import { shareProgress } from "./share-progress";
import { useDailyProgress } from "./use-daily-progress";

const POINTER_CLICK_DEDUP_MS = 350;

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
	const lastPointerPressAtRef = useRef(0);
	const highlightResetTimerRef = useRef<number | null>(null);
	const completionTrackedRef = useRef(false);
	const { captureEvent, captureException } = useObservability();
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
		};
	}, []);

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

	const cellLetters = useMemo(
		() => buildCellLetters(puzzle.wordSlots, revealedAnswers, hintLetters),
		[hintLetters, puzzle.wordSlots, revealedAnswers],
	);

	const nextHintCellKey = useMemo(
		() => getNextHintCellKey(puzzle, revealedCells),
		[puzzle, revealedCells],
	);
	const streakStats = useMemo(() => {
		const baseEntries = activeUser
			? (initialData.historyEntries ?? [])
			: getSortedAnonymousHistoryEntries();
		const streakEntries = upsertHistoryEntry(
			baseEntries,
			buildHistoryEntry(puzzle, derivedProgress),
		);

		return calculateHistoryStreaks(streakEntries, {
			referenceDateKey: puzzle.dateKey,
		});
	}, [activeUser, derivedProgress, initialData.historyEntries, puzzle]);

	const triggerHaptic = useCallback((duration = 8) => {
		if (typeof window === "undefined" || typeof navigator === "undefined") {
			return;
		}

		const nav = navigator as Navigator & { standalone?: boolean };
		const isStandalone =
			window.matchMedia("(display-mode: standalone)").matches ||
			nav.standalone === true;

		if (!isStandalone || typeof navigator.vibrate !== "function") {
			return;
		}

		navigator.vibrate(duration);
	}, []);

	const runPressAction = useCallback(
		(
			event: React.PointerEvent<HTMLButtonElement>,
			action: () => void,
		): void => {
			if (event.pointerType === "mouse" && event.button !== 0) {
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
		triggerHaptic(10);

		if (!currentGuess.trim()) return;
		if (!/^[a-zA-ZÀ-ÿçÇ·]+$/.test(currentGuess.trim())) {
			toast.error("La paraula no és vàlida");
			setCurrentGuess("");
			return;
		}

		const guess = currentGuess.trim();
		const prettyGuess = formatGuess(guess);
		const result = await resolveGuess({
			puzzle,
			progress: derivedProgress,
			guess,
		});

		if (
			result.matchedSlotId != null &&
			derivedProgress.guessedWordIds.includes(result.matchedSlotId)
		) {
			toast.info(
				<span>
					Ja has encertat <b>{result.displayWord}</b>
				</span>,
			);
			setCurrentGuess("");
			return;
		}

		if (result.duplicate) {
			if (result.displayWord) {
				toast.info(
					<span>
						Ja has encertat <b>{result.displayWord}</b>
					</span>,
				);
			} else {
				toast.info(
					<span>
						Ja has provat <b>{prettyGuess}</b>
					</span>,
				);
			}
			setCurrentGuess("");
			return;
		}

		applyLocalEvent(
			createPuzzleEvent("guess_added", {
				guessHash: result.guessHash,
				matchedWordId: result.matchedSlotId,
				unlockToken: result.unlockToken,
			}),
		);

		if (result.displayWord) {
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
			captureEvent("puzzle_guess_result", {
				date_key: puzzle.dateKey,
				guess_length: guess.length,
				matched: true,
				puzzle_id: puzzle.id,
			});
			toast.success(
				<span>
					Correcte! Has trobat <b>{result.displayWord}</b>
				</span>,
			);

			if (derivedProgress.guessedWordIds.length + 1 === totalWords) {
				window.setTimeout(() => {
					toast.success("Has completat el joc!");
				}, 500);
			}
		} else {
			captureEvent("puzzle_guess_result", {
				date_key: puzzle.dateKey,
				guess_length: guess.length,
				matched: false,
				puzzle_id: puzzle.id,
			});
			toast.error(
				<span>
					<b>{prettyGuess}</b> no hi és
				</span>,
			);
		}

		setCurrentGuess("");
	}, [
		applyLocalEvent,
		captureEvent,
		currentGuess,
		derivedProgress,
		puzzle,
		totalWords,
		triggerHaptic,
	]);

	const handleLetterClick = useCallback(
		(letter: string) => {
			triggerHaptic(8);
			setCurrentGuess((previous) => previous + letter);
		},
		[triggerHaptic],
	);

	const handleBackspace = useCallback(() => {
		triggerHaptic(8);
		setCurrentGuess((previous) => previous.slice(0, -1));
	}, [triggerHaptic]);

	const handleShuffle = useCallback(() => {
		triggerHaptic(8);
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
		triggerHaptic(8);
		if (derivedProgress.hintsUsed >= 3) return;
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
		nextHintCellKey,
		puzzle.dateKey,
		puzzle.id,
		triggerHaptic,
	]);

	const isComplete = derivedProgress.guessedWordIds.length === totalWords;

	const handleShare = useCallback(async () => {
		try {
			const result = await shareProgress(
				puzzle,
				revealedCells,
				derivedProgress.guessedWordIds.length,
				totalWords,
			);
			if (result === "copied") {
				toast.success("Imatge copiada!");
			}
		} catch {
			toast.error("No s'ha pogut compartir");
		}
	}, [
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

	return (
		<div
			className={`min-h-full px-3 sm:px-4 lg:px-8 pt-4 sm:pt-6 lg:pt-8 ${
				isComplete
					? "pb-6 sm:pb-8 lg:pb-24"
					: "pb-[calc(21rem+env(safe-area-inset-bottom))] sm:pb-[calc(21rem+env(safe-area-inset-bottom))] lg:pb-24"
			}`}
		>
			<div className="max-w-5xl mx-auto">
				<div className={`mb-4 sm:mb-6 ${isComplete ? "pt-2 sm:pt-0" : ""}`}>
					{isComplete ? (
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
						<>
							<div className="mb-2 flex items-center justify-between text-sm font-medium text-muted-foreground font-ui">
								<span>
									{derivedProgress.guessedWordIds.length} / {totalWords}{" "}
									paraules trobades
								</span>
								<div className="flex items-center gap-3">
									<span>
										{derivedProgress.guessCount} intent
										{derivedProgress.guessCount === 1 ? "" : "s"}
									</span>
									<Button
										variant="ghost"
										size="sm"
										className="gap-1.5 h-7 px-2 -mr-2"
										onClick={() => void handleShare()}
									>
										<Share2 className="w-3.5 h-3.5" />
									</Button>
								</div>
							</div>

							<Progress
								value={derivedProgress.guessedWordIds.length}
								max={totalWords}
								className="h-2"
							/>
						</>
					)}
				</div>

				<div className="lg:grid lg:grid-cols-[1fr_18rem] lg:gap-8 xl:grid-cols-[1fr_20rem]">
					<div>
						<DailyGrid
							puzzle={puzzle}
							revealedCells={revealedCells}
							cellLetters={cellLetters}
							highlightedWordId={highlightedWordId}
						/>
					</div>

					<div className="mt-6 lg:mt-0 lg:space-y-6">
						<DailyControls
							canUseHint={
								derivedProgress.hintsUsed < 3 && nextHintCellKey != null
							}
							currentGuess={currentGuess}
							hintsUsed={derivedProgress.hintsUsed}
							isComplete={isComplete}
							shuffledLetters={derivedProgress.shuffledLetters}
							onBackspace={handleBackspace}
							onHint={handleHint}
							onLetterClick={handleLetterClick}
							onShuffle={handleShuffle}
							onSubmitGuess={() => {
								void handleGuess();
							}}
							runClickAction={runClickAction}
							runPressAction={runPressAction}
						/>

						<div>
							<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 font-ui">
								Paraules ({derivedProgress.guessedWordIds.length}/{totalWords})
							</h3>
							<DailyWordList
								puzzle={puzzle}
								guessedWordIds={derivedProgress.guessedWordIds}
								revealedAnswers={revealedAnswers}
								cellLetters={cellLetters}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
