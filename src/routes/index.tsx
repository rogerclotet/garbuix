import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, RefreshCw, Trophy, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import allWords from "@/data/catalan-words.json";
import {
	type CrosswordGrid,
	generateCrossword,
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

	// Load words and generate crossword
	useEffect(() => {
		try {
			const words = allWords as string[];
			setWordList(words);

			// Generate initial crossword
			const newCrossword = generateCrossword(words, 5, 15);
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

	const handleGuess = (e: React.FormEvent) => {
		e.preventDefault();

		if (!crossword || !currentGuess.trim()) return;

		const guess = currentGuess.trim();

		// Check if word matches any unguessed words
		const matchingWord = crossword.words.find(
			(w) => !guessedWords.has(w.id) && wordsMatch(w.word, guess),
		);

		if (matchingWord) {
			setGuessedWords(new Set([...guessedWords, matchingWord.id]));
			setMessage({
				text: `Correcte! Has trobat "${matchingWord.word}"`,
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
		} else {
			setMessage({
				text: "Aquesta paraula no hi és",
				type: "error",
			});
		}
	};

	const handleNewGame = () => {
		if (wordList.length === 0) return;

		const newCrossword = generateCrossword(wordList, 5, 15);
		setCrossword(newCrossword);
		setGuessedWords(new Set());
		setCurrentGuess("");
		setMessage({ text: "Nou joc generat!", type: "info" });
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
						<span className="font-medium">{message.text}</span>
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
																	: "bg-white dark:bg-slate-800 border-gray-300 dark:border-gray-600 text-transparent"
															}`}
														>
															{cell.letter.toUpperCase()}
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
									<form onSubmit={handleGuess} className="space-y-4">
										<Input
											type="text"
											value={currentGuess}
											onChange={(e) => setCurrentGuess(e.target.value)}
											placeholder="Escriu una paraula..."
											className="text-lg"
											autoComplete="off"
											autoFocus
										/>
										<Button type="submit" className="w-full" size="lg">
											Comprovar
										</Button>
									</form>
									<p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
										💡 Consell: Escriu paraules sense accents
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
										Has completat el cruciugrama!
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
