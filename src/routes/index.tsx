import { createFileRoute } from "@tanstack/react-router";
import {
	CheckCircle2,
	Delete,
	RefreshCw,
	Shuffle,
	Trophy,
	XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import allWords from "@/data/catalan-words.json";
import {
	type CrosswordGrid,
	filterWordsByLetters,
	generateCrossword,
	getRandomLetterSet,
	normalizeWord,
	shuffleArray,
	wordsMatch,
} from "@/lib/crossword-generator";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	const [crossword, setCrossword] = useState<CrosswordGrid | null>(null);
	const [guessedWords, setGuessedWords] = useState<Set<number>>(new Set());
	const [currentGuess, setCurrentGuess] = useState("");
	const [message, setMessage] = useState<{
		text: string;
		type: "success" | "error" | "info";
	} | null>(null);
	const [wordList, setWordList] = useState<string[]>([]);
	const [loading, setLoading] = useState(true);
	const [shuffledLetters, setShuffledLetters] = useState<string[]>([]);

	// Load words and generate crossword
	useEffect(() => {
		try {
			const words = allWords as string[];
			setWordList(words);

			// Generate initial crossword
			let letters: string[] = [];
			let newCrossword: CrosswordGrid | null = null;
			let attempts = 0;

			while (attempts < 30) {
				letters = getRandomLetterSet(words);
				const filteredWords = filterWordsByLetters(words, letters);

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

			if (!newCrossword) throw new Error("Failed to generate crossword");

			setShuffledLetters(shuffleArray(letters));
			setCrossword(newCrossword);
			setLoading(false);
		} catch (error) {
			console.error("Failed to load words:", error);
			setMessage({ text: "Error carregant el diccionari", type: "error" });
			setLoading(false);
		}
	}, []);

	const revealedCells = useMemo(() => {
		if (!crossword) return new Set<string>();

		const cells = new Set<string>();
		for (const wordId of guessedWords) {
			const word = crossword.words[wordId];
			for (let i = 0; i < word.word.length; i++) {
				const row =
					word.direction === "horizontal" ? word.startRow : word.startRow + i;
				const col =
					word.direction === "horizontal" ? word.startCol + i : word.startCol;
				cells.add(`${row},${col}`);
			}
		}
		return cells;
	}, [crossword, guessedWords]);

	const handleGuess = (e?: React.FormEvent) => {
		if (e) e.preventDefault();

		if (!crossword || !currentGuess.trim()) return;

		const guess = currentGuess.trim();

		// Check if word matches any unguessed words
		const matchingWord = crossword.words.find(
			(w) => !guessedWords.has(w.id) && wordsMatch(w.word, guess),
		);

		if (matchingWord) {
			setGuessedWords(new Set([...guessedWords, matchingWord.id]));
			setMessage({
				text: `Correcte! Has trobat <b>${matchingWord.word}</b>`,
				type: "success",
			});
			setCurrentGuess("");

			// Check if game is complete
			if (guessedWords.size + 1 === crossword.words.length) {
				setTimeout(() => {
					setMessage({
						text: "🎉 Enhorabona! Has completat el joc!",
						type: "success",
					});
				}, 500);
			}
		} else if (guess.match(/^[a-zA-Z]+$/)) {
			setMessage({
				text: `<b>${guess.slice(0, 1).toUpperCase()}${guess.slice(1).toLowerCase()}</b> no hi és`,
				type: "error",
			});
			setCurrentGuess("");
		} else {
			setMessage({
				text: `La paraula no és vàlida`,
				type: "error",
			});
			setCurrentGuess("");
		}
	};

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
			} catch (e) {
				// continue
			}
			attempts++;
		}

		if (!newCrossword) {
			setMessage({ text: "No s'ha pogut generar un joc vàlid", type: "error" });
			return;
		}

		setShuffledLetters(shuffleArray(letters));
		setCrossword(newCrossword);
		setGuessedWords(new Set());
		setCurrentGuess("");
		setMessage({ text: "Nou joc generat!", type: "info" });
	};

	const handleLetterClick = (letter: string) => {
		setCurrentGuess((prev) => prev + letter);
	};

	const handleBackspace = () => {
		setCurrentGuess((prev) => prev.slice(0, -1));
	};

	const handleShuffle = () => {
		setShuffledLetters(shuffleArray(shuffledLetters));
	};

	if (loading) {
		return (
			<div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 dark:border-indigo-400 mx-auto mb-4"></div>
					<p className="text-lg text-gray-700 dark:text-gray-300">
						Carregant paraules...
					</p>
				</div>
			</div>
		);
	}

	if (!crossword) {
		return (
			<div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
				<Card className="max-w-md">
					<CardHeader>
						<CardTitle className="text-red-600 dark:text-red-400">
							Error
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="dark:text-gray-300">
							No s'ha pogut generar el joc de mots encreuats
						</p>
						<Button onClick={handleNewGame} className="mt-4">
							Tornar a intentar
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	const progress = (guessedWords.size / crossword.words.length) * 100;
	const isComplete = guessedWords.size === crossword.words.length;

	return (
		<div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8 transition-colors">
			<div className="max-w-7xl mx-auto">
				{/* Progress */}
				<div className="mb-6">
					<div className="flex items-center justify-between mb-2">
						<span className="text-sm font-medium text-gray-700 dark:text-gray-300">
							Progrés: {guessedWords.size} / {crossword.words.length}
						</span>
						<Button
							onClick={handleNewGame}
							variant="outline"
							size="sm"
							className="gap-2"
						>
							<RefreshCw className="w-4 h-4" />
							Nou joc
						</Button>
					</div>
					<div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
						<div
							className="bg-linear-to-r from-indigo-500 to-purple-600 dark:from-indigo-400 dark:to-purple-500 h-full transition-all duration-500 rounded-full"
							style={{ width: `${progress}%` }}
						/>
					</div>
				</div>

				{/* Message */}
				{message && (
					<div
						className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
							message.type === "success"
								? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
								: message.type === "error"
									? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
									: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"
						}`}
					>
						{message.type === "success" && <CheckCircle2 className="w-5 h-5" />}
						{message.type === "error" && <XCircle className="w-5 h-5" />}
						{message.type === "info" && <Trophy className="w-5 h-5" />}
						<span
							className="font-medium"
							// biome-ignore lint/security/noDangerouslySetInnerHtml: This is not direct user input, only guessable text can be part of the message, html markup is added later
							dangerouslySetInnerHTML={{ __html: message.text }}
						/>
					</div>
				)}

				<div className="grid lg:grid-cols-3 gap-6">
					{/* Crossword Grid */}
					<div className="lg:col-span-2">
						<Card>
							<CardContent>
								<div className="overflow-x-auto">
									<div className="inline-block min-w-full">
										<div
											className="grid gap-1"
											style={{
												gridTemplateColumns: `repeat(${crossword.cols}, minmax(0, 1fr))`,
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
																className="w-8 h-8 md:w-10 md:h-10 bg-transparent"
															/>
														);
													}

													return (
														<div
															key={key}
															className={`w-8 h-8 md:w-10 md:h-10 border-2 flex items-center justify-center font-bold text-sm md:text-base transition-all duration-300 ${
																isRevealed
																	? "bg-indigo-100 dark:bg-indigo-900/50 border-indigo-400 dark:border-indigo-500 text-indigo-900 dark:text-indigo-200"
																	: "bg-white dark:bg-slate-800 border-gray-300 dark:border-gray-600"
															}`}
														>
															{isRevealed ? cell.letter.toUpperCase() : ""}
														</div>
													);
												}),
											)}
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Guess Form and Word List */}
					<div className="space-y-6">
						{/* Guess Form */}
						{!isComplete && (
							<Card>
								<CardHeader>
									<CardTitle>Endevina una paraula</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="flex flex-col items-center gap-6">
										{/* Current Guess Display */}
										<div className="text-3xl font-bold tracking-widest h-12 border-b-2 border-indigo-300 dark:border-indigo-700 min-w-50 text-center uppercase flex items-center justify-center dark:text-white">
											{currentGuess}
										</div>

										{/* Letter Buttons */}
										<div className="grid grid-cols-3 gap-3">
											{shuffledLetters.map((letter) => (
												<Button
													key={`letter-${letter}`}
													variant="outline"
													size="lg"
													className="w-14 h-14 md:w-16 md:h-16 text-xl font-bold rounded-full border-2 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors"
													onClick={() => handleLetterClick(letter)}
												>
													{letter.toUpperCase()}
												</Button>
											))}
										</div>

										{/* Actions */}
										<div className="flex gap-4 w-full">
											<Button
												variant="ghost"
												onClick={handleShuffle}
												className="flex-1 gap-2"
											>
												<Shuffle className="w-4 h-4" />
												Barreja
											</Button>
											<Button
												variant="ghost"
												onClick={handleBackspace}
												className="flex-1 gap-2"
												disabled={currentGuess.length === 0}
											>
												<Delete className="w-4 h-4" />
												Esborra
											</Button>
										</div>

										<Button
											onClick={() => handleGuess()}
											className="w-full"
											size="lg"
											disabled={currentGuess.length < 3}
										>
											Comprovar
										</Button>
									</div>
									<p className="text-sm text-center text-gray-600 dark:text-gray-400 mt-6">
										Toca les lletres per formar paraules
									</p>
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
												className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
											>
												<CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
												<span className="font-medium text-green-900 dark:text-green-300">
													{word.word}
												</span>
												<span className="text-xs text-green-600 dark:text-green-400 ml-auto">
													{word.word.length} lletres
												</span>
											</div>
										))}

									{crossword.words
										.filter((w) => !guessedWords.has(w.id))
										.map((word) => (
											<div
												key={word.id}
												className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
											>
												<div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 shrink-0" />
												<span className="text-gray-400 dark:text-gray-500">
													{"?".repeat(word.word.length)}
												</span>
												<span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
													{word.word.length} lletres
												</span>
											</div>
										))}
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
										Has guanyat!
									</p>
									<Button
										onClick={handleNewGame}
										size="lg"
										className="w-full gap-2"
									>
										<RefreshCw className="w-5 h-5" />
										Jugar de nou
									</Button>
								</CardContent>
							</Card>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
