import { CheckCircle2, Delete, Lightbulb, Shuffle } from "lucide-react";
import {
	type CSSProperties,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import {
	type CrosswordGrid,
	filterWordsByLetters,
	generateCrossword,
	getRandomLetterSet,
	normalizeWord,
	SeededRandom,
	shuffleArray,
	wordsMatch,
} from "@/lib/crossword-generator";
import { Progress } from "../ui/progress";

const STATE_KEY_PREFIX = "paraules-state-";

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

	// Set a timer to update the seed at midnight
	useEffect(() => {
		const midnight = new Date();
		midnight.setHours(24, 0, 0, 0);
		const timeToMidnight = midnight.getTime() - Date.now();
		const timer = setTimeout(() => {
			setSeed(getCurrentSeed());
		}, timeToMidnight);

		return () => clearTimeout(timer);
	}, []);

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

				const sortedSavedLetters = savedShuffledLetters.sort();
				const sortedLetters = letters.sort();
				if (sortedSavedLetters.join("") !== sortedLetters.join("")) {
					// Ignore saved state if letters have changed
					return;
				}

				if (savedGuessedWords) setGuessedWords(new Set(savedGuessedWords));
				if (savedGuesses) setGuesses(savedGuesses);
				if (savedHintsUsed) setHintsUsed(savedHintsUsed);
				if (savedHintedCells) setHintedCells(new Set(savedHintedCells));
				if (savedShuffledLetters) setShuffledLetters(savedShuffledLetters);
			} catch (e) {
				console.error("Failed to parse saved state:", e);
			}
		},
		[],
	);

	// Load words and generate crossword
	useEffect(() => {
		try {
			const words = allWords as Word[];
			const random = new SeededRandom(seed);

			// Cleanup old states
			const keysToRemove: string[] = [];
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key?.startsWith(STATE_KEY_PREFIX) && key !== getStateKey(seed)) {
					keysToRemove.push(key);
				}
			}
			for (const key of keysToRemove) {
				localStorage.removeItem(key);
			}

			// Generate initial crossword
			let letters: string[] = [];
			let newCrossword: CrosswordGrid | null = null;
			let attempts = 0;

			while (attempts < 30) {
				letters = getRandomLetterSet(words, random);
				const filteredWords = filterWordsByLetters(words, letters);

				try {
					const result = generateCrossword(filteredWords, 5, 15, random);
					const usedLetters = new Set(
						result.words.flatMap((w) => normalizeWord(w.word.name).split("")),
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

			if (!newCrossword) throw new Error("Failed to generate crossword");

			setShuffledLetters(random.shuffleArray(letters));
			setCrossword(newCrossword);

			// Load saved state for today
			const savedState = localStorage.getItem(getStateKey(seed));
			if (savedState) {
				loadSavedState(savedState, letters);
			}

			setLoading(false);
		} catch (error) {
			console.error("Failed to load words:", error);
			toast.error("Error carregant el diccionari");
			setLoading(false);
		}
	}, [seed, loadSavedState]);

	// Save game state to localStorage
	useEffect(() => {
		if (!crossword) return;

		if (getCurrentSeed() !== seed) {
			localStorage.removeItem(getStateKey(seed));
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

		if (!crossword || !currentGuess.trim()) return;

		const guess = currentGuess.trim();
		setGuesses((prev) => [...prev, guess]);

		// Check if word matches any unguessed words
		const matchingWord = crossword.words.find(
			(w) => !guessedWords.has(w.id) && wordsMatch(w.word.name, guess),
		);

		if (matchingWord) {
			setGuessedWords(new Set([...guessedWords, matchingWord.id]));
			toast.success(
				<span>
					Correcte! Has trobat <b>{matchingWord.word.name}</b>
				</span>,
			);
			setCurrentGuess("");

			// Check if game is complete
			if (guessedWords.size + 1 === crossword.words.length) {
				setTimeout(() => {
					toast.success("🎉 Enhorabona! Has completat el joc!");
				}, 500);
			}
		} else if (guess.match(/^[a-zA-ZçÇ]+$/)) {
			toast.error(
				<span>
					<b>
						{guess.slice(0, 1).toUpperCase()}
						{guess.slice(1).toLowerCase()}
					</b>{" "}
					no hi és
				</span>,
			);
			setCurrentGuess("");
		} else {
			toast.error("La paraula no és vàlida");
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
		setCurrentGuess((prev) => prev + letter);
	};

	const handleBackspace = () => {
		setCurrentGuess((prev) => prev.slice(0, -1));
	};

	const handleShuffle = () => {
		setShuffledLetters(shuffleArray(shuffledLetters));
	};

	const handleHint = () => {
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
							<Card className="fixed bottom-0 left-0 right-0 z-40 rounded-t-2xl rounded-b-none shadow-[0_-8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_-8px_30px_rgb(0,0,0,0.5)] border-t lg:bg-card lg:dark:bg-card backdrop-blur-md transition-all duration-300 lg:static lg:rounded-xl lg:shadow-sm lg:border lg:backdrop-blur-none">
								<CardHeader className="hidden lg:block">
									<CardTitle>Endevina una paraula</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="flex flex-col items-center gap-4 lg:gap-6">
										{/* Current Guess Display */}
										<div className="text-2xl sm:text-3xl font-bold tracking-widest h-10 sm:h-12 border-b-2 border-primary w-full text-center uppercase flex items-center justify-center dark:text-white">
											{currentGuess}
										</div>

										{/* Letter Buttons */}
										<div className="grid grid-cols-3 gap-2 sm:gap-3">
											{shuffledLetters.map((letter) => (
												<Button
													key={`letter-${letter}`}
													variant="outline"
													size="lg"
													className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 text-xl font-bold rounded-full border-2 transition-colors"
													onClick={() => handleLetterClick(letter)}
												>
													{letter.toUpperCase()}
												</Button>
											))}
										</div>

										<div className="w-[80%] mx-auto">
											<Button
												onClick={() => handleGuess()}
												className="w-full h-10 sm:h-12"
												size="lg"
												disabled={currentGuess.length < 3}
											>
												Comprovar
											</Button>
										</div>

										{/* Actions */}
										<div className="grid grid-cols-3 gap-2 sm:gap-4 w-full">
											<Button
												variant="ghost"
												onClick={handleBackspace}
												className="gap-2 h-9 sm:h-10"
												disabled={currentGuess.length === 0}
											>
												<Delete className="w-4 h-4" />
												Esborrar
											</Button>
											<Button
												variant="ghost"
												onClick={handleHint}
												className="gap-2 h-9 sm:h-10"
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
												className="gap-2 h-9 sm:h-10"
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
					</div>
				</div>
			</div>
		</div>
	);
}

function getCurrentSeed(): number {
	const today = new Date();
	return (
		(today.getFullYear() - 2000) * 10000 +
		(today.getMonth() + 1) * 100 +
		today.getDate()
	);
}

function getStateKey(seed: number) {
	return `${STATE_KEY_PREFIX}${seed}`;
}
