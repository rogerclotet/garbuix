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
import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import {
	type CrosswordGrid,
	generateDailyCrosswordForSeed,
	shuffleArray,
	wordsMatch,
} from "@/lib/crossword-generator";
import {
	getCurrentSeed,
	getStateKey,
	saveHistorySnapshot,
} from "@/lib/history";
import { Progress } from "../ui/progress";

export function Daily() {
	const [crossword, setCrossword] = useState<CrosswordGrid | null>(null);
	const [guessedWords, setGuessedWords] = useState<Set<number>>(new Set());
	const [guesses, setGuesses] = useState<string[]>([]);
	const [hintsUsed, setHintsUsed] = useState(0);
	const [hintedCells, setHintedCells] = useState<Set<string>>(new Set());
	const [currentGuess, setCurrentGuess] = useState("");
	const [seed, setSeed] = useState(getCurrentSeed());

	const [loading, setLoading] = useState(true);
	const [shuffledLetters, setShuffledLetters] = useState<string[]>([]);

	const formatGuess = useCallback((guess: string) => {
		if (!guess) return "";
		return `${guess.slice(0, 1).toUpperCase()}${guess.slice(1).toLowerCase()}`;
	}, []);

	const resetGameProgress = useCallback(() => {
		setGuessedWords(new Set());
		setGuesses([]);
		setHintsUsed(0);
		setHintedCells(new Set());
		setCurrentGuess("");
	}, []);

	const refreshSeedIfNeeded = useCallback(() => {
		const currentSeed = getCurrentSeed();
		setSeed((previousSeed) =>
			previousSeed === currentSeed ? previousSeed : currentSeed,
		);
	}, []);

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

	// Set a timer to update the seed at midnight
	useEffect(() => {
		const midnight = new Date();
		midnight.setHours(24, 0, 0, 0);
		const timeToMidnight = midnight.getTime() - Date.now();
		const timer = setTimeout(() => {
			refreshSeedIfNeeded();
		}, timeToMidnight);

		return () => clearTimeout(timer);
	}, [refreshSeedIfNeeded]);

	// Refresh when returning to the app after midnight
	useEffect(() => {
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				refreshSeedIfNeeded();
			}
		};

		window.addEventListener("focus", refreshSeedIfNeeded);
		window.addEventListener("pageshow", refreshSeedIfNeeded);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			window.removeEventListener("focus", refreshSeedIfNeeded);
			window.removeEventListener("pageshow", refreshSeedIfNeeded);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [refreshSeedIfNeeded]);

	const loadSavedState = useCallback(
		(savedState: string, letters: string[]) => {
			try {
				const {
					guessedWords: savedGuessedWords,
					guesses: savedGuesses,
					hintsUsed: savedHintsUsed,
					hintedCells: savedHintedCells,
					shuffledLetters: savedShuffledLetters,
				} = JSON.parse(savedState);

				if (!Array.isArray(savedShuffledLetters)) {
					return;
				}

				const sortedSavedLetters = [...savedShuffledLetters].sort();
				const sortedLetters = [...letters].sort();
				if (sortedSavedLetters.join("") !== sortedLetters.join("")) {
					// Ignore saved state if letters have changed
					return;
				}

				if (Array.isArray(savedGuessedWords)) {
					setGuessedWords(new Set(savedGuessedWords));
				}
				if (Array.isArray(savedGuesses)) {
					setGuesses(savedGuesses);
				}
				if (typeof savedHintsUsed === "number") {
					setHintsUsed(savedHintsUsed);
				}
				if (Array.isArray(savedHintedCells)) {
					setHintedCells(new Set(savedHintedCells));
				}
				setShuffledLetters(savedShuffledLetters);
			} catch (e) {
				console.error("Failed to parse saved state:", e);
			}
		},
		[],
	);

	// Load words and generate crossword
	useEffect(() => {
		setLoading(true);
		try {
			const currentSeed = getCurrentSeed();
			if (seed !== currentSeed) {
				setSeed(currentSeed);
				return;
			}

			const words = allWords as Word[];
			const result = generateDailyCrosswordForSeed(words, seed);
			if (!result) throw new Error("Failed to generate crossword");

			setShuffledLetters(result.shuffledLetters);
			setCrossword(result.crossword);
			resetGameProgress();

			// Load saved state for today
			const savedState = localStorage.getItem(getStateKey(seed));
			if (savedState) {
				loadSavedState(savedState, result.letters);
			}
		} catch (error) {
			console.error("Failed to load words:", error);
			toast.error("Error carregant el diccionari");
		} finally {
			setLoading(false);
		}
	}, [seed, loadSavedState, resetGameProgress]);

	// Save game state to localStorage
	useEffect(() => {
		if (!crossword) return;

		if (getCurrentSeed() !== seed) {
			setSeed(getCurrentSeed());
			return;
		}

		const state = {
			guessedWords: Array.from(guessedWords),
			guesses,
			hintsUsed,
			hintedCells: Array.from(hintedCells),
			shuffledLetters,
		};
		localStorage.setItem(getStateKey(seed), JSON.stringify(state));
		saveHistorySnapshot({
			seed,
			totalWords: crossword.words.length,
			guessedWords: guessedWords.size,
			guesses: guesses.length,
			hintsUsed,
		});
	}, [
		guessedWords,
		guesses,
		hintsUsed,
		hintedCells,
		shuffledLetters,
		crossword,
		seed,
	]);

	const revealedCells = useMemo(() => {
		if (!crossword) return new Set<string>();

		const cells = new Set<string>(hintedCells);
		for (const wordId of guessedWords) {
			const word = crossword.words[wordId];
			for (let i = 0; i < word.word.name.length; i++) {
				const row =
					word.direction === "horizontal" ? word.startRow : word.startRow + i;
				const col =
					word.direction === "horizontal" ? word.startCol + i : word.startCol;
				cells.add(`${row},${col}`);
			}
		}
		return cells;
	}, [crossword, guessedWords, hintedCells]);

	const handleGuess = (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		triggerHaptic(10);

		if (!crossword || !currentGuess.trim()) return;

		const guess = currentGuess.trim();
		const isValidGuess = /^[a-zA-ZçÇ]+$/.test(guess);
		if (!isValidGuess) {
			toast.error("La paraula no és vàlida");
			setCurrentGuess("");
			return;
		}

		const matchingWord = crossword.words.find((w) =>
			wordsMatch(w.word.name, guess),
		);
		const prettyGuess = formatGuess(guess);

		if (matchingWord && guessedWords.has(matchingWord.id)) {
			toast.info(
				<span>
					Ja has encertat <b>{matchingWord.word.name}</b>
				</span>,
			);
			setCurrentGuess("");
			return;
		}

		const alreadyTried = guesses.some((prev) => wordsMatch(prev, guess));
		if (alreadyTried) {
			if (matchingWord) {
				toast.info(
					<span>
						Ja has encertat <b>{matchingWord.word.name}</b>
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

		setGuesses((prev) => [...prev, guess]);

		// Check if word matches any unguessed words
		const unguessedMatch =
			matchingWord && !guessedWords.has(matchingWord.id) ? matchingWord : null;

		if (unguessedMatch) {
			setGuessedWords(new Set([...guessedWords, unguessedMatch.id]));
			toast.success(
				<span>
					Correcte! Has trobat <b>{unguessedMatch.word.name}</b>
				</span>,
			);
			setCurrentGuess("");

			// Check if game is complete
			if (guessedWords.size + 1 === crossword.words.length) {
				setTimeout(() => {
					toast.success("🎉 Enhorabona! Has completat el joc!");
				}, 500);
			}
		} else {
			toast.error(
				<span>
					<b>{prettyGuess}</b> no hi és
				</span>,
			);
			setCurrentGuess("");
		}
	};

	/*
	const handleNewGame = () => {
		if (wordList.length === 0) return;

		let letters: string[] = [];
		let newCrossword: CrosswordGrid | null = null;
		let attempts = 0;

		while (attempts < 30) {
			letters = getRandomLetterSet(wordList);
			const filteredWords = filterWordsByLetters(wordList, letters);
			try {
				const result = generateCrossword(filteredWords, 5, 15);
				const usedLetters = new Set(
					result.words.flatMap((w) => normalizeWord(w.word).split("")),
				);

				if (letters.every((l) => usedLetters.has(l))) {
					newCrossword = result;
					break;
				}
			} catch (_e) {
				// continue
			}
			attempts++;
		}

		if (!newCrossword) {
			toast.error("No s'ha pogut generar un joc vàlid");
			return;
		}

		setShuffledLetters(shuffleArray(letters));
		setCrossword(newCrossword);
		setGuessedWords(new Set());
		setCurrentGuess("");
		toast.info("Nou joc generat!");
	};
	*/

	const handleLetterClick = (letter: string) => {
		triggerHaptic(8);
		setCurrentGuess((prev) => prev + letter);
	};

	const handleBackspace = () => {
		triggerHaptic(8);
		setCurrentGuess((prev) => prev.slice(0, -1));
	};

	const handleShuffle = () => {
		triggerHaptic(8);
		setShuffledLetters(shuffleArray(shuffledLetters));
	};

	const handleHint = () => {
		triggerHaptic(8);
		if (!crossword || hintsUsed >= 3) return;

		const hiddenCells: string[] = [];
		for (let r = 0; r < crossword.grid.length; r++) {
			for (let c = 0; c < crossword.grid[r].length; c++) {
				if (crossword.grid[r][c]) {
					const key = `${r},${c}`;
					if (!revealedCells.has(key)) {
						hiddenCells.push(key);
					}
				}
			}
		}

		if (hiddenCells.length > 0) {
			const randomKey =
				hiddenCells[Math.floor(Math.random() * hiddenCells.length)];
			setHintedCells((prev) => new Set([...prev, randomKey]));
			setHintsUsed((prev) => prev + 1);
		}
	};

	const hasProgress =
		guessedWords.size > 0 || guesses.length > 0 || hintsUsed > 0;

	const handleResetDailyProgress = () => {
		triggerHaptic(10);
		resetGameProgress();
		toast.success("S'ha reiniciat el progrés d'avui");
	};

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

	if (loading) {
		return (
			<div className="h-full flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto mb-4"></div>
					<p className="text-lg text-muted-foreground">Carregant paraules...</p>
				</div>
			</div>
		);
	}

	if (!crossword) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<Card className="max-w-md">
					<CardHeader>
						<CardTitle className="text-red-600 dark:text-red-400">
							Error
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="dark:text-gray-300">No s'ha pogut generar el joc</p>
						{/* <Button onClick={handleNewGame} className="mt-4">
							Tornar a intentar
						</Button> */}
					</CardContent>
				</Card>
			</div>
		);
	}

	const isComplete = guessedWords.size === crossword.words.length;
	return (
		<div className="min-h-screen p-2 sm:p-4 lg:p-8 pb-86 lg:pb-8">
			<div className="max-w-7xl mx-auto">
				{/* Progress */}
				<div className="mb-6">
					<div className="flex items-center justify-between mb-2 text-sm font-medium opacity-70">
						<span>
							{guessedWords.size} / {crossword.words.length} paraules trobades
						</span>
						<div className="flex gap-4">
							<span>
								{guesses.length} intent{guesses.length === 1 ? "" : "s"}
							</span>
						</div>
					</div>

					<Progress
						value={guessedWords.size}
						max={crossword.words.length}
						className="h-3"
					/>
				</div>

				<div className="grid lg:grid-cols-3 gap-6">
					{/* Crossword Grid */}
					<div className="lg:col-span-2">
						<Card>
							<CardContent className="p-2 sm:p-4 md:p-6">
								<div
									className="flex items-center justify-center w-full @container"
									style={{ "--cols": crossword.cols } as CSSProperties}
								>
									<div
										className="grid gap-0.5 sm:gap-1 w-full max-w-2xl mx-auto"
										style={{
											gridTemplateColumns: `repeat(${crossword.cols}, 1fr)`,
										}}
									>
										{crossword.grid.map((row, rowIdx) =>
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
																? "bg-primary/10 border-primary/40 text-secondary-foreground"
																: "bg-border/30 border-border"
														}`}
													>
														{isRevealed ? cell.letter.toUpperCase() : ""}
													</div>
												);
											}),
										)}
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Guess Form and Word List */}
					<div className="lg:space-y-6">
						{/* Guess Form */}
						{!isComplete && (
							<Card className="fixed bottom-0 left-0 right-0 z-40 rounded-t-2xl rounded-b-none shadow-[0_-8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_-8px_30px_rgb(0,0,0,0.5)] border-t lg:bg-card lg:dark:bg-card backdrop-blur-md transition-all duration-300 lg:static lg:rounded-xl lg:shadow-none lg:dark:shadow-none lg:border lg:backdrop-blur-none">
								<CardHeader className="hidden lg:block">
									<CardTitle>Endevina una paraula</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="flex flex-col items-center gap-4 lg:gap-6">
										{/* Current Guess Display */}
										<div className="text-2xl sm:text-3xl font-bold tracking-widest h-10 sm:h-12 border-b-2 border-primary w-full text-center uppercase flex items-center justify-center dark:text-white">
											{currentGuess}
										</div>

										{/* Letter Buttons + Submit */}
										<div className="flex items-center justify-evenly w-full gap-4 sm:gap-6">
											<div className="grid grid-cols-3 gap-2 sm:gap-3">
												{shuffledLetters.map((letter) => (
													<Button
														key={`letter-${letter}`}
														variant="outline"
														size="lg"
														className="w-[3.25rem] h-[3.25rem] sm:w-14 sm:h-14 md:w-16 md:h-16 text-xl font-bold rounded-full border-2 transition-all duration-100 active:scale-95 active:bg-primary/10 active:shadow-inner"
														onClick={() => handleLetterClick(letter)}
													>
														{letter.toUpperCase()}
													</Button>
												))}
											</div>
											<Button
												onClick={() => handleGuess()}
												size="icon"
												className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl transition-transform duration-100 active:scale-95"
												disabled={currentGuess.length < 4}
												aria-label="Comprovar"
											>
												<CornerDownLeft className="h-5 w-5" />
											</Button>
										</div>

										{/* Actions */}
										<div className="grid grid-cols-3 gap-2 sm:gap-4 w-full">
											<Button
												variant="ghost"
												onClick={handleBackspace}
												className="gap-2 h-9 sm:h-10 transition-transform duration-100 active:scale-[0.98]"
												disabled={currentGuess.length === 0}
											>
												<Delete className="w-4 h-4" />
												Esborrar
											</Button>
											<Button
												variant="ghost"
												onClick={handleHint}
												className="gap-2 h-9 sm:h-10 transition-transform duration-100 active:scale-[0.98]"
												disabled={hintsUsed >= 3 || isComplete}
												size="lg"
											>
												<Lightbulb
													className={`w-4 h-4 ${hintsUsed < 3 ? "text-amber-500" : "text-gray-400"}`}
												/>
												Pista ({3 - hintsUsed})
											</Button>
											<Button
												variant="ghost"
												onClick={handleShuffle}
												className="gap-2 h-9 sm:h-10 transition-transform duration-100 active:scale-[0.98]"
											>
												<Shuffle className="w-4 h-4" />
												Barrejar
											</Button>
										</div>
									</div>
								</CardContent>
							</Card>
						)}

						{/* Word List */}
						<Card>
							<CardHeader>
								<CardTitle>
									Paraules trobades ({guessedWords.size}/
									{crossword.words.length})
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-2 max-h-96 overflow-y-auto">
									{crossword.words
										.filter((w) => guessedWords.has(w.id))
										.map((word) => (
											<div
												key={word.id}
												className="flex flex-col gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
											>
												<div className="flex items-center gap-2">
													<CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
													<span className="font-medium text-green-900 dark:text-green-300 tracking-widest">
														{word.word.name.toUpperCase()}
													</span>
													<span className="text-xs text-green-600 dark:text-green-400 ml-auto">
														{word.word.name.length} lletres
													</span>
												</div>

												<p className="text-xs text-green-900/80 dark:text-green-400/80">
													{word.word.areatematica}
												</p>

												{word.word.definition && (
													<p className="text-xs text-green-900/80 dark:text-green-400/80">
														{word.word.definition}
													</p>
												)}
											</div>
										))}

									{crossword.words
										.filter((w) => !guessedWords.has(w.id))
										.map((word) => {
											const displayedWord = word.word.name
												.split("")
												.map((char, i) => {
													const row =
														word.direction === "horizontal"
															? word.startRow
															: word.startRow + i;
													const col =
														word.direction === "horizontal"
															? word.startCol + i
															: word.startCol;
													return revealedCells.has(`${row},${col}`)
														? char.toUpperCase()
														: "_";
												})
												.join("");

											return (
												<div
													key={word.id}
													className="flex items-center gap-2 p-3 rounded-lg border bg-border/20"
												>
													<div className="w-5 h-5 rounded-full border-2 shrink-0" />
													<span className="font-mono text-muted-foreground tracking-widest">
														{displayedWord}
													</span>
													<span className="text-xs ml-auto">
														{word.word.name.length} lletres
													</span>
												</div>
											);
										})}
								</div>
							</CardContent>
						</Card>

						{/* Victory */}
						{isComplete && (
							<Card className="bg-linear-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-yellow-300 dark:border-yellow-700">
								<CardHeader>
									<CardTitle className="text-center text-2xl dark:text-yellow-300">
										🎉 Felicitats! 🎉
									</CardTitle>
								</CardHeader>
								<CardContent className="text-center">
									<p className="text-gray-700 dark:text-gray-300 mb-4">
										Has guanyat en {guesses.length} intents!
										{hintsUsed > 0 && ` I has fet servir ${hintsUsed} pistes.`}
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
