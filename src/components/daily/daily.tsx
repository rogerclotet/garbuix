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
import { DailyControls } from "./daily-controls";
import { DailyGrid } from "./daily-grid";
import { buildCellLetters, buildRevealedCells } from "./daily-helpers";
import { DailyResetProgressDialog } from "./daily-reset-progress-dialog";
import type { DailyData } from "./daily-types";
import { DailyWordList } from "./daily-word-list";
import { useDailyProgress } from "./use-daily-progress";

const POINTER_CLICK_DEDUP_MS = 350;

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
	const { applyLocalEvent, derivedProgress } = useDailyProgress({
		activeUser,
		deviceId,
		initialData,
	});

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			const [nextAnswers, nextHints] = await Promise.all([
				decodeRevealedAnswers(puzzle, derivedProgress),
				decodeHintLetters(puzzle, derivedProgress),
			]);

			if (!cancelled) {
				setRevealedAnswers(nextAnswers);
				setHintLetters(nextHints);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [derivedProgress, puzzle]);

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
			toast.error(
				<span>
					<b>{prettyGuess}</b> no hi és
				</span>,
			);
		}

		setCurrentGuess("");
	}, [
		applyLocalEvent,
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
		applyLocalEvent(
			createPuzzleEvent("letters_shuffled", {
				shuffledLetters,
			}),
		);
	}, [applyLocalEvent, derivedProgress.shuffledLetters, triggerHaptic]);

	const handleHint = useCallback(() => {
		triggerHaptic(8);
		if (derivedProgress.hintsUsed >= 3) return;

		const nextHint = puzzle.hintCapsules.find(
			(capsule) =>
				!revealedCells.has(capsule.cellKey) &&
				!derivedProgress.hintedCells.includes(capsule.cellKey),
		);

		if (!nextHint) return;
		applyLocalEvent(
			createPuzzleEvent("hint_used", {
				cellKey: nextHint.cellKey,
			}),
		);
	}, [
		applyLocalEvent,
		derivedProgress.hintedCells,
		derivedProgress.hintsUsed,
		puzzle.hintCapsules,
		revealedCells,
		triggerHaptic,
	]);

	const handleResetDailyProgress = useCallback(() => {
		triggerHaptic(10);
		applyLocalEvent(createPuzzleEvent("progress_reset", {}));
		toast.success("S'ha reiniciat el progrés d'avui");
	}, [applyLocalEvent, triggerHaptic]);

	const isComplete = derivedProgress.guessedWordIds.length === totalWords;
	const hasProgress =
		derivedProgress.guessedWordIds.length > 0 ||
		derivedProgress.guessCount > 0 ||
		derivedProgress.hintsUsed > 0;

	return (
		<div className="min-h-screen p-2 sm:p-4 lg:p-8 pb-86 lg:pb-8">
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
