import { getRouteApi, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import {
	type CSSProperties,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { authClient } from "@/lib/auth-client";
import {
	buildAnonymousImportPayload,
	getDeviceId,
	getSortedAnonymousHistoryEntries,
	hasImportedAnonymousData,
	markAnonymousDataImported,
} from "@/lib/puzzle-local";
import {
	getHistoryPageData,
	importAnonymousProgress,
} from "@/lib/puzzle-server-fns";
import type {
	DailyPuzzlePreview,
	HistorySummaryEntry,
} from "@/lib/puzzle-types";
import { useObservability } from "@/lib/use-observability";

const rootRoute = getRouteApi("__root__");

const dateFormatter = new Intl.DateTimeFormat("ca-ES", {
	day: "numeric",
	month: "long",
	year: "numeric",
});

type HistoryData = {
	accountHistory: HistorySummaryEntry[] | null;
	yesterdayPuzzle: {
		dateKey: string;
		preview: DailyPuzzlePreview;
	};
};

export function History({ initialData }: { initialData: HistoryData }) {
	const rootData = rootRoute.useLoaderData();
	const session = authClient.useSession();
	const activeUser = session.data?.user ?? rootData.sessionUser;
	const fetchHistory = useServerFn(getHistoryPageData);
	const importProgress = useServerFn(importAnonymousProgress);
	const deviceId = useMemo(() => getDeviceId(), []);
	const importAttemptedRef = useRef<string | null>(null);
	const { captureEvent, captureException } = useObservability();
	const [accountHistory, setAccountHistory] = useState<
		HistorySummaryEntry[] | null
	>(initialData.accountHistory);
	const [anonymousHistory, setAnonymousHistory] = useState<
		HistorySummaryEntry[]
	>([]);

	useEffect(() => {
		setAnonymousHistory(getSortedAnonymousHistoryEntries());
	}, []);

	useEffect(() => {
		let cancelled = false;

		const loadHistory = async () => {
			if (!activeUser) {
				if (!cancelled) {
					setAccountHistory(null);
				}
				return;
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
						const result = await importProgress({
							data: {
								deviceId,
								payload,
							},
						});
						markAnonymousDataImported(activeUser.id);
						captureEvent("anonymous_history_imported", {
							active_progress_count: Object.keys(payload.activeProgressByDate)
								.length,
							imported_dates: result.importedDates.length,
							legacy_dates: result.skippedLegacyDates.length,
						});
						toast.success("S'han sincronitzat els resultats locals");
					} catch (error) {
						console.error("Failed to import anonymous history", error);
						captureException(error, {
							scope: "anonymous_history_import",
						});
					}
				} else {
					markAnonymousDataImported(activeUser.id);
				}
			}

			try {
				const data = await fetchHistory();
				if (!cancelled) {
					setAccountHistory(data.accountHistory ?? []);
				}
			} catch (error) {
				console.error("Failed to load account history", error);
				captureException(error, {
					scope: "history_fetch",
				});
			}
		};

		void loadHistory();

		return () => {
			cancelled = true;
		};
	}, [
		activeUser,
		captureEvent,
		captureException,
		deviceId,
		fetchHistory,
		importProgress,
	]);

	const entries = activeUser ? (accountHistory ?? []) : anonymousHistory;

	const stats = useMemo(() => {
		const totalDays = entries.length;
		const completedDays = entries.filter((entry) => entry.completed).length;
		const completionRate = totalDays
			? Math.round((completedDays / totalDays) * 100)
			: 0;
		const totalGuesses = entries.reduce(
			(total, entry) => total + entry.guessCount,
			0,
		);
		const avgGuesses = totalDays ? totalGuesses / totalDays : 0;

		return {
			totalDays,
			completedDays,
			completionRate,
			avgGuesses,
		};
	}, [entries]);

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
											{entries.map((entry) => {
												const dateLabel = dateFormatter.format(
													new Date(`${entry.dateKey}T12:00:00.000Z`),
												);
												const progressLabel = `${entry.guessedWords} / ${entry.totalWords}`;

												return (
													<div
														key={`${entry.dateKey}:${entry.seed ?? "legacy"}`}
														className="rounded-lg border border-border/60 bg-background/70 p-4 space-y-3"
													>
														<div className="flex flex-wrap items-center gap-3">
															<div className="font-semibold">{dateLabel}</div>
															<Badge
																variant={
																	entry.completed ? "secondary" : "outline"
																}
															>
																{entry.completed ? "Completat" : "Incomplet"}
															</Badge>
															{entry.legacy ? (
																<Badge variant="outline">Importat</Badge>
															) : null}
															<span className="text-sm text-muted-foreground">
																{entry.guessCount} intent
																{entry.guessCount === 1 ? "" : "s"} ·{" "}
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
									<span>
										{dateFormatter.format(
											new Date(
												`${initialData.yesterdayPuzzle.dateKey}T12:00:00.000Z`,
											),
										)}
									</span>
								</div>

								<div
									className="flex items-center justify-center w-full @container"
									style={
										{
											"--cols": initialData.yesterdayPuzzle.preview.cols,
										} as CSSProperties
									}
								>
									<div
										className="grid gap-0.5 sm:gap-1 w-full max-w-sm mx-auto"
										style={{
											gridTemplateColumns: `repeat(${initialData.yesterdayPuzzle.preview.cols}, 1fr)`,
										}}
									>
										{initialData.yesterdayPuzzle.preview.gridLetters.map(
											(row, rowIdx) =>
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
															{cell.toUpperCase()}
														</div>
													);
												}),
										)}
									</div>
								</div>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}
