import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import {
	type CrosswordGrid,
	generateDailyCrosswordForSeed,
} from "@/lib/crossword-generator";
import {
	getCurrentSeed,
	getHistoryEntries,
	getHistoryEntry,
	getYesterdaySeed,
	type HistoryEntry,
	seedToDate,
} from "@/lib/history";

const dateFormatter = new Intl.DateTimeFormat("ca-ES", {
	day: "numeric",
	month: "long",
	year: "numeric",
});

export function History() {
	const [entries, setEntries] = useState<HistoryEntry[]>([]);
	const [yesterdayCrossword, setYesterdayCrossword] =
		useState<CrosswordGrid | null>(null);
	const [yesterdayEntry, setYesterdayEntry] = useState<HistoryEntry | null>(
		null,
	);
	const [yesterdaySeed, setYesterdaySeed] = useState<number | null>(null);

	useEffect(() => {
		setEntries(getHistoryEntries());
		const seed = getYesterdaySeed();
		const words = allWords as Word[];
		const result = generateDailyCrosswordForSeed(words, seed);
		setYesterdayCrossword(result?.crossword ?? null);
		setYesterdayEntry(getHistoryEntry(seed));
		setYesterdaySeed(seed);
	}, []);

	const currentSeed = getCurrentSeed();
	const yesterdayDateLabel = yesterdaySeed
		? dateFormatter.format(seedToDate(yesterdaySeed))
		: null;

	const previousEntries = useMemo(
		() => entries.filter((entry) => entry.seed < currentSeed),
		[entries, currentSeed],
	);

	const stats = useMemo(() => {
		const totalDays = previousEntries.length;
		const completedDays = previousEntries.filter(
			(entry) => entry.completed,
		).length;
		const completionRate = totalDays
			? Math.round((completedDays / totalDays) * 100)
			: 0;
		const totalGuesses = previousEntries.reduce(
			(total, entry) => total + entry.guesses,
			0,
		);
		const avgGuesses = totalDays ? totalGuesses / totalDays : 0;

		return {
			totalDays,
			completedDays,
			completionRate,
			avgGuesses,
		};
	}, [previousEntries]);

	return (
		<div className="min-h-screen p-2 sm:p-4 lg:p-8 pb-16">
			<div className="max-w-5xl mx-auto space-y-6">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-2xl font-bold">Dies anteriors</h2>
						<p className="text-sm text-muted-foreground">
							Consulta els resultats dels dies passats i el teu progrés.
						</p>
					</div>
					<Button variant="ghost" size="sm" asChild>
						<Link to="/" className="gap-2">
							<ArrowLeft className="h-4 w-4" />
							Tornar
						</Link>
					</Button>
				</div>

				<div className="grid gap-6 lg:grid-cols-2">
					<div className="order-2 lg:order-1 space-y-6">
						{stats.totalDays === 0 ? (
							<Card>
								<CardHeader>
									<CardTitle>Encara no hi ha historial</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-muted-foreground">
										Quan hagis jugat algun dia anterior, aquí veuràs les teves
										estadístiques.
									</p>
								</CardContent>
							</Card>
						) : (
							<>
								<div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
									<Card>
										<CardHeader className="pb-2">
											<CardTitle className="text-sm text-muted-foreground font-medium">
												Dies jugats
											</CardTitle>
										</CardHeader>
										<CardContent>
											<div className="text-3xl font-bold">
												{stats.totalDays}
											</div>
										</CardContent>
									</Card>
									<Card>
										<CardHeader className="pb-2">
											<CardTitle className="text-sm text-muted-foreground font-medium">
												Dies completats
											</CardTitle>
										</CardHeader>
										<CardContent>
											<div className="text-3xl font-bold">
												{stats.completedDays}
											</div>
										</CardContent>
									</Card>
									<Card>
										<CardHeader className="pb-2">
											<CardTitle className="text-sm text-muted-foreground font-medium">
												Percentatge completat
											</CardTitle>
										</CardHeader>
										<CardContent>
											<div className="text-3xl font-bold">
												{stats.completionRate}%
											</div>
										</CardContent>
									</Card>
									<Card>
										<CardHeader className="pb-2">
											<CardTitle className="text-sm text-muted-foreground font-medium">
												Mitjana intents
											</CardTitle>
										</CardHeader>
										<CardContent>
											<div className="text-3xl font-bold">
												{stats.avgGuesses.toFixed(1)}
											</div>
										</CardContent>
									</Card>
								</div>
								<p className="text-sm text-muted-foreground">
									Has completat {stats.completedDays} de {stats.totalDays} dies.
								</p>

								<Card>
									<CardHeader>
										<CardTitle>Resultats recents</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="space-y-4">
											{previousEntries.map((entry) => {
												const dateLabel = dateFormatter.format(
													seedToDate(entry.seed),
												);
												const progressLabel = `${entry.guessedWords} / ${entry.totalWords}`;
												const isComplete = entry.completed;

												return (
													<div
														key={entry.seed}
														className="rounded-lg border border-border/60 bg-background/70 p-4 space-y-3"
													>
														<div className="flex flex-wrap items-center gap-3">
															<div className="font-semibold">{dateLabel}</div>
															<Badge
																variant={isComplete ? "secondary" : "outline"}
															>
																{isComplete ? "Completat" : "Incomplet"}
															</Badge>
															<span className="text-sm text-muted-foreground">
																{entry.guesses} intent
																{entry.guesses === 1 ? "" : "s"} ·{" "}
																{entry.hintsUsed} pista
																{entry.hintsUsed === 1 ? "" : "s"}
															</span>
														</div>
														<div className="space-y-2">
															<div className="flex items-center justify-between text-sm text-muted-foreground">
																<span>Paraules trobades</span>
																<span>{progressLabel}</span>
															</div>
															<Progress
																value={entry.guessedWords}
																max={entry.totalWords}
															/>
														</div>
													</div>
												);
											})}
										</div>
									</CardContent>
								</Card>
							</>
						)}
					</div>

					<div className="order-1 lg:order-2">
						<Card>
							<CardHeader>
								<CardTitle>Resultat d'ahir</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
									<span>{yesterdayDateLabel ?? "Carregant..."}</span>
									{yesterdayEntry ? (
										<span>
											· {yesterdayEntry.guessedWords} /{" "}
											{yesterdayEntry.totalWords} paraules
											{yesterdayEntry.completed ? " · completat" : ""}
										</span>
									) : (
										<span>· no es va jugar</span>
									)}
								</div>

								{yesterdayCrossword ? (
									<div
										className="flex items-center justify-center w-full @container"
										style={
											{ "--cols": yesterdayCrossword.cols } as CSSProperties
										}
									>
										<div
											className="grid gap-0.5 sm:gap-1 w-full max-w-sm mx-auto"
											style={{
												gridTemplateColumns: `repeat(${yesterdayCrossword.cols}, 1fr)`,
											}}
										>
											{yesterdayCrossword.grid.map((row, rowIdx) =>
												row.map((cell, colIdx) => {
													const key = `${rowIdx},${colIdx}`;

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
															className="aspect-square border rounded-[0.2rem] sm:rounded-[0.3rem] sm:border-2 flex items-center justify-center font-bold leading-none overflow-hidden text-[clamp(0.25rem,calc(42cqi/var(--cols)),0.95rem)] bg-primary/10 border-primary/40 text-secondary-foreground"
														>
															{cell.letter.toUpperCase()}
														</div>
													);
												}),
											)}
										</div>
									</div>
								) : (
									<p className="text-sm text-muted-foreground">
										No s'ha pogut carregar la graella d'ahir.
									</p>
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}
