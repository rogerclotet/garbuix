import { useServerFn } from "@tanstack/react-start";
import {
	CheckCircle2,
	CornerDownLeft,
	Delete,
	Lightbulb,
	RotateCcw,
	Shuffle,
} from "lucide-react";
import {
	type CSSProperties,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { authClient } from "@/lib/auth-client";
import {
	createPuzzleEvent,
	decodeHintLetters,
	decodeRevealedAnswers,
	resolveGuess,
} from "@/lib/puzzle-client";
import {
	buildAnonymousImportPayload,
	getAccountPuzzleCache,
	getAnonymousProgress,
	getDeviceId,
	hasImportedAnonymousData,
	markAnonymousDataImported,
	saveAccountPuzzleCache,
	saveAnonymousHistoryEntry,
	saveAnonymousProgress,
} from "@/lib/puzzle-local";
import {
	applyPuzzleEvent,
	applyPuzzleEvents,
	createEmptyProgressState,
} from "@/lib/puzzle-progress";
import {
	getUserPuzzleProgress,
	importAnonymousProgress,
	syncUserPuzzleEvents,
} from "@/lib/puzzle-server-fns";
import { formatGuess } from "@/lib/puzzle-text";
import type {
	DailyPuzzlePublic,
	PuzzleClientEvent,
	PuzzleProgressState,
} from "@/lib/puzzle-types";
import { shuffleArray } from "@/lib/shuffle";

const POINTER_CLICK_DEDUP_MS = 350;

type DailyData = {
	puzzle: DailyPuzzlePublic;
	progress: PuzzleProgressState | null;
	rolloverAt: string;
	sessionUser: {
		id: string;
		name: string;
		email: string;
		image?: string | null;
	} | null;
};

function buildHistoryEntry(
	puzzle: DailyPuzzlePublic,
	progress: PuzzleProgressState,
) {
	return {
		dateKey: puzzle.dateKey,
		seed: puzzle.seed,
		totalWords: puzzle.wordSlots.length,
		guessedWords: progress.guessedWordIds.length,
		guessCount: progress.guessCount,
		hintsUsed: progress.hintsUsed,
		completed: progress.guessedWordIds.length >= puzzle.wordSlots.length,
		lastUpdated: new Date().toISOString(),
	};
}

export function Daily({ initialData }: { initialData: DailyData }) {
	const session = authClient.useSession();
	const activeUser = session.data?.user ?? initialData.sessionUser;
	const puzzle = initialData.puzzle;
	const totalWords = puzzle.wordSlots.length;
	const deviceId = useMemo(() => getDeviceId(), []);
	const syncEvents = useServerFn(syncUserPuzzleEvents);
	const fetchUserProgress = useServerFn(getUserPuzzleProgress);
	const importProgress = useServerFn(importAnonymousProgress);

	const [baseProgress, setBaseProgress] = useState<PuzzleProgressState>(() => {
		const empty = createEmptyProgressState(puzzle);
		return (
			initialData.progress ?? getAnonymousProgress(puzzle.dateKey) ?? empty
		);
	});
	const [queuedEvents, setQueuedEvents] = useState<PuzzleClientEvent[]>([]);
	const [currentGuess, setCurrentGuess] = useState("");
	const [revealedAnswers, setRevealedAnswers] = useState<
		Record<number, string>
	>({});
	const [hintLetters, setHintLetters] = useState<Record<string, string>>({});
	const [isOnline, setIsOnline] = useState(() =>
		typeof navigator === "undefined" ? true : navigator.onLine,
	);
	const [isSyncing, setIsSyncing] = useState(false);
	const lastPointerPressAtRef = useRef(0);
	const importAttemptedRef = useRef<string | null>(null);

	const derivedProgress = useMemo(
		() =>
			activeUser
				? applyPuzzleEvents(baseProgress, queuedEvents, totalWords)
				: baseProgress,
		[activeUser, baseProgress, queuedEvents, totalWords],
	);

	useEffect(() => {
		let cancelled = false;

		const loadProgress = async () => {
			const empty = createEmptyProgressState(puzzle);

			if (activeUser) {
				const cached = getAccountPuzzleCache(activeUser.id, puzzle.dateKey);
				if (cached) {
					if (!cancelled) {
						setBaseProgress(
							cached.baseProgress ?? initialData.progress ?? empty,
						);
						setQueuedEvents(cached.queuedEvents ?? []);
					}
				} else {
					const latestProgress =
						(await fetchUserProgress({
							data: { puzzleId: puzzle.id },
						})) ??
						initialData.progress ??
						empty;

					if (!cancelled) {
						setBaseProgress(latestProgress);
						setQueuedEvents([]);
					}
				}

				if (
					!hasImportedAnonymousData(activeUser.id) &&
					importAttemptedRef.current !== activeUser.id
				) {
					importAttemptedRef.current = activeUser.id;
					const payload = buildAnonymousImportPayload();
					if (
						payload.historyEntries.length > 0 ||
						Object.keys(payload.activeProgressByDate).length > 0
					) {
						try {
							await importProgress({
								data: {
									deviceId,
									payload,
								},
							});
							markAnonymousDataImported(activeUser.id);
							const refreshed = await fetchUserProgress({
								data: { puzzleId: puzzle.id },
							});
							if (!cancelled && refreshed) {
								setBaseProgress(refreshed);
							}
							toast.success("S'han sincronitzat els resultats locals");
						} catch (error) {
							console.error("Failed to import anonymous progress", error);
						}
					} else {
						markAnonymousDataImported(activeUser.id);
					}
				}

				return;
			}

			if (!cancelled) {
				setQueuedEvents([]);
				setBaseProgress(getAnonymousProgress(puzzle.dateKey) ?? empty);
			}
		};

		void loadProgress();

		return () => {
			cancelled = true;
		};
	}, [
		activeUser,
		deviceId,
		fetchUserProgress,
		importProgress,
		initialData.progress,
		puzzle,
	]);

	useEffect(() => {
		if (activeUser) {
			saveAccountPuzzleCache(activeUser.id, puzzle.dateKey, {
				baseProgress,
				queuedEvents,
			});
			return;
		}

		saveAnonymousProgress(puzzle.dateKey, derivedProgress);
		saveAnonymousHistoryEntry(buildHistoryEntry(puzzle, derivedProgress));
	}, [activeUser, baseProgress, derivedProgress, puzzle, queuedEvents]);

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

		const onOnline = () => setIsOnline(true);
		const onOffline = () => setIsOnline(false);
		window.addEventListener("online", onOnline);
		window.addEventListener("offline", onOffline);

		return () => {
			window.removeEventListener("online", onOnline);
			window.removeEventListener("offline", onOffline);
		};
	}, []);

	useEffect(() => {
		if (!activeUser || queuedEvents.length === 0 || !isOnline || isSyncing) {
			return;
		}

		let cancelled = false;
		const pendingEvents = [...queuedEvents];

		setIsSyncing(true);
		void syncEvents({
			data: {
				puzzleId: puzzle.id,
				deviceId,
				events: pendingEvents,
			},
		})
			.then((result) => {
				if (cancelled) return;
				setBaseProgress(result.progress);
				setQueuedEvents((previous) =>
					previous.filter((event) => !result.ackedEventIds.includes(event.id)),
				);
			})
			.catch((error) => {
				console.error("Failed to sync puzzle events", error);
			})
			.finally(() => {
				if (!cancelled) {
					setIsSyncing(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [
		activeUser,
		deviceId,
		isOnline,
		isSyncing,
		puzzle.id,
		queuedEvents,
		syncEvents,
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

	const revealedCells = useMemo(() => {
		const cells = new Set<string>(derivedProgress.hintedCells);

		for (const slot of puzzle.wordSlots) {
			if (!derivedProgress.guessedWordIds.includes(slot.id)) continue;
			for (let index = 0; index < slot.length; index += 1) {
				const row =
					slot.direction === "horizontal"
						? slot.startRow
						: slot.startRow + index;
				const col =
					slot.direction === "horizontal"
						? slot.startCol + index
						: slot.startCol;
				cells.add(`${row},${col}`);
			}
		}

		return cells;
	}, [
		derivedProgress.guessedWordIds,
		derivedProgress.hintedCells,
		puzzle.wordSlots,
	]);

	const cellLetters = useMemo(() => {
		const letters = new Map<string, string>();

		for (const slot of puzzle.wordSlots) {
			const answer = revealedAnswers[slot.id];
			if (!answer) continue;

			for (let index = 0; index < answer.length; index += 1) {
				const row =
					slot.direction === "horizontal"
						? slot.startRow
						: slot.startRow + index;
				const col =
					slot.direction === "horizontal"
						? slot.startCol + index
						: slot.startCol;
				letters.set(`${row},${col}`, answer[index] ?? "");
			}
		}

		for (const [cellKey, letter] of Object.entries(hintLetters)) {
			if (!letters.has(cellKey)) {
				letters.set(cellKey, letter);
			}
		}

		return letters;
	}, [hintLetters, puzzle.wordSlots, revealedAnswers]);

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

	const applyLocalEvent = useCallback(
		(event: PuzzleClientEvent) => {
			if (activeUser) {
				setQueuedEvents((previous) => [...previous, event]);
				return;
			}

			setBaseProgress((previous) =>
				applyPuzzleEvent(previous, event, totalWords),
			);
		},
		[activeUser, totalWords],
	);

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

	const resetProgressControl = (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="border-border/70 bg-background/60 text-muted-foreground hover:text-foreground"
					disabled={!hasProgress}
				>
					<RotateCcw className="w-3.5 h-3.5" />
					Reiniciar progrés d'avui
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>Reiniciar el progrés d'avui?</AlertDialogTitle>
					<AlertDialogDescription>
						Això esborrarà les paraules trobades, els intents i les pistes
						utilitzades d'avui.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel·lar</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						onClick={handleResetDailyProgress}
					>
						Reiniciar
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);

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
								<div
									className="flex items-center justify-center w-full @container"
									style={{ "--cols": puzzle.cols } as CSSProperties}
								>
									<div
										className="grid gap-0.5 sm:gap-1 w-full max-w-2xl mx-auto"
										style={{
											gridTemplateColumns: `repeat(${puzzle.cols}, 1fr)`,
										}}
									>
										{puzzle.gridMask.map((row, rowIdx) =>
											row.map((cell, colIdx) => {
												const key = `${rowIdx},${colIdx}`;
												const isRevealed = revealedCells.has(key);

												if (!cell) {
													return (
														<div
															key={key}
															className="aspect-square bg-transparent"
														/>
													);
												}

												return (
													<div
														key={key}
														className={`aspect-square border rounded-[0.4rem] sm:rounded-[0.6rem] sm:border-2 flex items-center justify-center font-bold leading-none overflow-hidden text-[clamp(0.25rem,calc(50cqi/var(--cols)),1.5rem)] transition-all duration-300 ${
															isRevealed
																? "bg-primary/18 border-primary/70 text-secondary-foreground"
																: "bg-muted/80 border-muted-foreground/30 dark:bg-muted/90 dark:border-muted-foreground/45"
														}`}
													>
														{isRevealed
															? cellLetters.get(key)?.toUpperCase()
															: ""}
													</div>
												);
											}),
										)}
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					<div className="lg:space-y-6">
						{!isComplete && (
							<Card className="fixed bottom-0 left-0 right-0 z-40 rounded-t-2xl rounded-b-none shadow-[0_-8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_-8px_30px_rgb(0,0,0,0.5)] border-t lg:bg-card lg:dark:bg-card backdrop-blur-md transition-all duration-300 lg:static lg:rounded-xl lg:shadow-none lg:dark:shadow-none lg:border lg:backdrop-blur-none">
								<CardHeader className="hidden lg:block">
									<CardTitle>Endevina una paraula</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="flex flex-col items-center gap-4 lg:gap-6">
										<div className="text-2xl sm:text-3xl font-bold tracking-widest h-10 sm:h-12 border-b-2 border-primary w-full text-center uppercase flex items-center justify-center dark:text-white">
											{currentGuess}
										</div>

										<div className="flex items-center justify-evenly w-full gap-4 sm:gap-6">
											<div className="grid grid-cols-3 gap-2 sm:gap-3">
												{derivedProgress.shuffledLetters.map((letter) => (
													<Button
														key={`letter-${letter}`}
														variant="outline"
														size="lg"
														className="w-[3.25rem] h-[3.25rem] sm:w-14 sm:h-14 md:w-16 md:h-16 text-xl font-bold rounded-full border-2 transition-all duration-100 active:scale-95 active:bg-primary/10 active:shadow-inner touch-manipulation"
														onPointerDown={(event) =>
															runPressAction(event, () =>
																handleLetterClick(letter),
															)
														}
														onClick={(event) =>
															runClickAction(event, () =>
																handleLetterClick(letter),
															)
														}
													>
														{letter.toUpperCase()}
													</Button>
												))}
											</div>
											<Button
												onPointerDown={(event) =>
													runPressAction(event, () => {
														void handleGuess();
													})
												}
												onClick={(event) =>
													runClickAction(event, () => {
														void handleGuess();
													})
												}
												size="icon"
												className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl transition-transform duration-100 active:scale-95 touch-manipulation"
												disabled={currentGuess.length < 4}
												aria-label="Comprovar"
											>
												<CornerDownLeft className="h-5 w-5" />
											</Button>
										</div>

										<div className="grid grid-cols-3 gap-2 sm:gap-4 w-full">
											<Button
												variant="ghost"
												onPointerDown={(event) =>
													runPressAction(event, handleBackspace)
												}
												onClick={(event) =>
													runClickAction(event, handleBackspace)
												}
												className="gap-2 h-9 sm:h-10 transition-transform duration-100 active:scale-[0.98] touch-manipulation"
												disabled={currentGuess.length === 0}
											>
												<Delete className="w-4 h-4" />
												Esborrar
											</Button>
											<Button
												variant="ghost"
												onPointerDown={(event) =>
													runPressAction(event, handleHint)
												}
												onClick={(event) => runClickAction(event, handleHint)}
												className="gap-2 h-9 sm:h-10 transition-transform duration-100 active:scale-[0.98] touch-manipulation"
												disabled={derivedProgress.hintsUsed >= 3 || isComplete}
												size="lg"
											>
												<Lightbulb
													className={`w-4 h-4 ${derivedProgress.hintsUsed < 3 ? "text-amber-500" : "text-gray-400"}`}
												/>
												Pista ({3 - derivedProgress.hintsUsed})
											</Button>
											<Button
												variant="ghost"
												onPointerDown={(event) =>
													runPressAction(event, handleShuffle)
												}
												onClick={(event) =>
													runClickAction(event, handleShuffle)
												}
												className="gap-2 h-9 sm:h-10 transition-transform duration-100 active:scale-[0.98] touch-manipulation"
											>
												<Shuffle className="w-4 h-4" />
												Barrejar
											</Button>
										</div>
									</div>
								</CardContent>
							</Card>
						)}

						<Card>
							<CardHeader>
								<CardTitle>
									Paraules trobades ({derivedProgress.guessedWordIds.length}/
									{totalWords})
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-2 max-h-96 overflow-y-auto">
									{puzzle.wordSlots
										.filter((slot) =>
											derivedProgress.guessedWordIds.includes(slot.id),
										)
										.map((slot) => (
											<div
												key={slot.id}
												className="flex flex-col gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
											>
												<div className="flex items-center gap-2">
													<CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
													<span className="font-medium text-green-900 dark:text-green-300 tracking-widest">
														{revealedAnswers[slot.id]?.toUpperCase()}
													</span>
													<span className="text-xs text-green-600 dark:text-green-400 ml-auto">
														{slot.length} lletres
													</span>
												</div>
											</div>
										))}

									{puzzle.wordSlots
										.filter(
											(slot) =>
												!derivedProgress.guessedWordIds.includes(slot.id),
										)
										.map((slot) => {
											const displayedWord = Array.from(
												{ length: slot.length },
												(_, index) => {
													const row =
														slot.direction === "horizontal"
															? slot.startRow
															: slot.startRow + index;
													const col =
														slot.direction === "horizontal"
															? slot.startCol + index
															: slot.startCol;
													return (
														cellLetters.get(`${row},${col}`)?.toUpperCase() ??
														"_"
													);
												},
											).join("");

											return (
												<div
													key={slot.id}
													className="flex items-center gap-2 p-3 rounded-lg border bg-border/20"
												>
													<div className="w-5 h-5 rounded-full border-2 shrink-0" />
													<span className="font-mono text-muted-foreground tracking-widest">
														{displayedWord}
													</span>
													<span className="text-xs ml-auto">
														{slot.length} lletres
													</span>
												</div>
											);
										})}
								</div>
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
							{resetProgressControl}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
