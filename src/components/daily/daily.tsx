import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { authClient } from "@/lib/auth-client";
import {
	createPuzzleEvent,
	decodeHintLetters,
	decodeRevealedAnswers,
	resolveGuess,
} from "@/lib/puzzle-client";
import { getDeviceId } from "@/lib/puzzle-local";
import { formatGuess } from "@/lib/puzzle-text";
import { shuffleArray } from "@/lib/shuffle";
import { useObservability } from "@/lib/use-observability";
import { DailyControls } from "./daily-controls";
import { DailyGrid } from "./daily-grid";
import {
	buildCellLetters,
	buildRevealedCells,
	getGuessKeyboardAction,
} from "./daily-helpers";
import { DailyResetProgressDialog } from "./daily-reset-progress-dialog";
import type { DailyData } from "./daily-types";
import { DailyWordList } from "./daily-word-list";
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
	const session = authClient.useSession();
	const activeUser = session.data?.user ?? initialData.sessionUser;
	const puzzle = initialData.puzzle;
	const totalWords = puzzle.wordSlots.length;
	const deviceId = useMemo(() => getDeviceId(), []);
	const [currentGuess, setCurrentGuess] = useState("");
	const [revealedAnswers, setRevealedAnswers] = useState<
		Record<number, string>
	>({});
	const [hintLetters, setHintLetters] = useState<Record<string, string>>({});
	const lastPointerPressAtRef = useRef(0);
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

		const nextHint = puzzle.hintCapsules.find(
			(capsule) =>
				!revealedCells.has(capsule.cellKey) &&
				!derivedProgress.hintedCells.includes(capsule.cellKey),
		);

		if (!nextHint) return;
		captureEvent("puzzle_hint_used", {
			date_key: puzzle.dateKey,
			hints_used_after: derivedProgress.hintsUsed + 1,
			puzzle_id: puzzle.id,
		});
		applyLocalEvent(
			createPuzzleEvent("hint_used", {
				cellKey: nextHint.cellKey,
			}),
		);
	}, [
		applyLocalEvent,
		captureEvent,
		derivedProgress.hintedCells,
		derivedProgress.hintsUsed,
		puzzle.dateKey,
		puzzle.hintCapsules,
		puzzle.id,
		revealedCells,
		triggerHaptic,
	]);

	const handleResetDailyProgress = useCallback(() => {
		triggerHaptic(10);
		completionTrackedRef.current = false;
		captureEvent("puzzle_progress_reset", {
			date_key: puzzle.dateKey,
			puzzle_id: puzzle.id,
		});
		applyLocalEvent(createPuzzleEvent("progress_reset", {}));
		toast.success("S'ha reiniciat el progrés d'avui");
	}, [applyLocalEvent, captureEvent, puzzle.dateKey, puzzle.id, triggerHaptic]);

	const isComplete = derivedProgress.guessedWordIds.length === totalWords;
	const hasProgress =
		derivedProgress.guessedWordIds.length > 0 ||
		derivedProgress.guessCount > 0 ||
		derivedProgress.hintsUsed > 0;

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
		<div className="min-h-full p-2 pb-[calc(21rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-[calc(21rem+env(safe-area-inset-bottom))] lg:p-8 lg:pb-8">
			<div className="max-w-7xl mx-auto">
				<div className="mb-6">
					<div className="flex items-center justify-between mb-2 text-sm font-medium opacity-70">
						<span>
							{derivedProgress.guessedWordIds.length} / {totalWords} paraules
							trobades
						</span>
						<div className="flex gap-4">
							<span>
								{derivedProgress.guessCount} intent
								{derivedProgress.guessCount === 1 ? "" : "s"}
							</span>
						</div>
					</div>

					<Progress
						value={derivedProgress.guessedWordIds.length}
						max={totalWords}
						className="h-3"
					/>
				</div>

				<div className="grid lg:grid-cols-3 gap-6">
					<div className="lg:col-span-2">
						<Card className="bg-background border-border/85">
							<CardContent className="p-2 sm:p-4 md:p-6">
								<DailyGrid
									puzzle={puzzle}
									revealedCells={revealedCells}
									cellLetters={cellLetters}
								/>
							</CardContent>
						</Card>
					</div>

					<div className="lg:space-y-6">
						<DailyControls
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

						<Card>
							<CardHeader>
								<CardTitle>
									Paraules trobades ({derivedProgress.guessedWordIds.length}/
									{totalWords})
								</CardTitle>
							</CardHeader>
							<CardContent>
								<DailyWordList
									puzzle={puzzle}
									guessedWordIds={derivedProgress.guessedWordIds}
									revealedAnswers={revealedAnswers}
									cellLetters={cellLetters}
								/>
							</CardContent>
						</Card>

						{isComplete && (
							<Card className="bg-linear-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-yellow-300 dark:border-yellow-700">
								<CardHeader>
									<CardTitle className="text-center text-2xl dark:text-yellow-300">
										🎉 Felicitats! 🎉
									</CardTitle>
								</CardHeader>
								<CardContent className="text-center">
									<p className="text-gray-700 dark:text-gray-300 mb-4">
										Has guanyat en {derivedProgress.guessCount} intents!
										{derivedProgress.hintsUsed > 0 &&
											` I has fet servir ${derivedProgress.hintsUsed} pistes.`}
									</p>
								</CardContent>
							</Card>
						)}

						<div className="mt-4 flex justify-center">
							<DailyResetProgressDialog
								hasProgress={hasProgress}
								onReset={handleResetDailyProgress}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
