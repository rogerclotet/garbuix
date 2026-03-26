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
import { Progress } from "@/components/ui/progress";
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
import { calculateHistoryStreaks } from "@/lib/puzzle-streaks";
import type {
	DailyPuzzlePreview,
	HistorySummaryEntry,
} from "@/lib/puzzle-types";
import { useActiveSessionUser } from "@/lib/use-active-session-user";
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
	const { activeUser } = useActiveSessionUser(rootData.sessionUser);
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
		const { bestStreak, currentStreak } = calculateHistoryStreaks(entries);
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
			currentStreak,
			bestStreak,
			completionRate,
			avgGuesses,
		};
	}, [entries]);

	const statCards = [
		{
			label: "Dies jugats",
			value: stats.totalDays,
		},
		{
			label: "Dies completats",
			value: stats.completedDays,
		},
		{
			label: "Percentatge completat",
			value: `${stats.completionRate}%`,
		},
		{
			label: "Ratxa actual",
			value: stats.currentStreak,
		},
		{
			label: "Millor ratxa",
			value: stats.bestStreak,
		},
		{
			label: "Mitjana intents",
			value: stats.avgGuesses.toFixed(1),
		},
	];

	return (
		<div className="min-h-screen px-3 sm:px-4 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-16">
			<div className="max-w-5xl mx-auto space-y-6">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-2xl font-bold">Dies anteriors</h2>
						<p className="text-sm text-muted-foreground font-ui">
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
							<div className="space-y-2">
								<h3 className="text-base font-semibold">
									Encara no hi ha historial
								</h3>
								<p className="text-sm text-muted-foreground font-ui">
									Quan hagis jugat algun dia anterior, aquí veuràs les teves
									estadístiques.
								</p>
							</div>
						) : (
							<>
								<div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
									{statCards.map((stat) => (
										<div
											key={stat.label}
											className="rounded-xl bg-muted/50 px-3 py-3 sm:min-h-28 sm:px-4 sm:py-4"
										>
											<div className="flex items-center justify-between gap-3 sm:h-full sm:flex-col sm:items-start">
												<span className="text-sm text-muted-foreground font-medium leading-tight font-ui">
													{stat.label}
												</span>
												<div className="shrink-0 text-2xl leading-none font-bold sm:mt-auto sm:text-3xl">
													{stat.value}
												</div>
											</div>
										</div>
									))}
								</div>

								<div className="space-y-4">
									<h3 className="text-base font-semibold">Resultats recents</h3>
									<div className="space-y-4">
										{entries.map((entry) => {
											const dateLabel = dateFormatter.format(
												new Date(`${entry.dateKey}T12:00:00.000Z`),
											);
											const progressLabel = `${entry.guessedWords} / ${entry.totalWords}`;

											return (
												<div
													key={`${entry.dateKey}:${entry.seed ?? "legacy"}`}
													className="rounded-lg border border-border/40 bg-muted/20 p-4 space-y-3"
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
														<span className="text-sm text-muted-foreground font-ui">
															{entry.guessCount} intent
															{entry.guessCount === 1 ? "" : "s"} ·{" "}
															{entry.hintsUsed === 1
																? `${entry.hintsUsed} pista`
																: `${entry.hintsUsed} pistes`}
														</span>
													</div>
													<div className="space-y-2">
														<div className="flex items-center justify-between text-sm text-muted-foreground font-ui">
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
								</div>
							</>
						)}
					</div>

					<div className="order-1 lg:order-2">
						<div className="rounded-xl bg-muted/30 p-4 sm:p-5 space-y-4">
							<div>
								<h3 className="text-base font-semibold">Resultat d'ahir</h3>
								<span className="text-sm text-muted-foreground font-ui">
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
									className="grid gap-[3px] sm:gap-1 w-full max-w-sm mx-auto"
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
														className="aspect-square border rounded-[0.2rem] sm:rounded-md flex items-center justify-center font-bold leading-none overflow-hidden text-[clamp(0.25rem,calc(42cqi/var(--cols)),0.95rem)] bg-primary/10 border-primary/30 text-foreground"
													>
														{cell.toUpperCase()}
													</div>
												);
											}),
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
