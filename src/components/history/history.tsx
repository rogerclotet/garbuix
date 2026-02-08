import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
	getCurrentSeed,
	getHistoryEntries,
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

	useEffect(() => {
		setEntries(getHistoryEntries());
	}, []);

	const currentSeed = getCurrentSeed();

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
				</div>

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
									<div className="text-3xl font-bold">{stats.totalDays}</div>
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
													<Badge variant={isComplete ? "secondary" : "outline"}>
														{isComplete ? "Completat" : "Incomplet"}
													</Badge>
													<span className="text-sm text-muted-foreground">
														{entry.guesses} intent
														{entry.guesses === 1 ? "" : "s"} · {entry.hintsUsed}{" "}
														pista
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
		</div>
	);
}
