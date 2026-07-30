import { getRouteApi } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	type CSSProperties,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { DifficultyBars } from "@/components/difficulty-bars";
import { LeaderboardList } from "@/components/leaderboard/leaderboard-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { LeaderboardSnapshot } from "@/lib/leaderboard-types";
import type { PuzzleDifficulty } from "@/lib/puzzle-difficulty";
import {
	buildAnonymousImportPayload,
	getDeviceId,
	getSortedAnonymousHistoryEntries,
	hasImportedAnonymousData,
	markAnonymousDataImported,
} from "@/lib/puzzle-local";
import {
	getHistoryPageData,
	getMoreHistoryEntries,
	importAnonymousProgress,
} from "@/lib/puzzle-server-fns";
import { calculateHistoryStats } from "@/lib/puzzle-streaks";
import {
	type DailyPuzzlePreview,
	HISTORY_PAGE_SIZE,
	type HistoryStats,
	type HistorySummaryEntry,
} from "@/lib/puzzle-types";
import { useActiveSessionUser } from "@/lib/use-active-session-user";
import { useObservability } from "@/lib/use-observability";

const rootRoute = getRouteApi("__root__");

const dateFormatter = new Intl.DateTimeFormat("ca-ES", {
	day: "numeric",
	month: "long",
	year: "numeric",
});

type AccountHistoryPage = {
	entries: HistorySummaryEntry[];
	hasMore: boolean;
	stats: HistoryStats;
};

type HistoryData = {
	accountHistory: AccountHistoryPage | null;
	yesterdayPuzzle: {
		dateKey: string;
		preview: DailyPuzzlePreview;
		difficulty?: PuzzleDifficulty | null;
	};
	yesterdayLeaderboard?: LeaderboardSnapshot;
};

const EMPTY_STATS: HistoryStats = {
	totalDays: 0,
	completedDays: 0,
	completionRate: 0,
	currentStreak: 0,
	bestStreak: 0,
	avgGuesses: 0,
};

export function History({ initialData }: { initialData: HistoryData }) {
	const rootData = rootRoute.useLoaderData();
	const { activeUser } = useActiveSessionUser(rootData.sessionUser);
	const fetchHistory = useServerFn(getHistoryPageData);
	const fetchMoreHistory = useServerFn(getMoreHistoryEntries);
	const importProgress = useServerFn(importAnonymousProgress);
	const deviceId = useMemo(() => getDeviceId(), []);
	const importAttemptedRef = useRef<string | null>(null);
	const { captureEvent, captureException } = useObservability();
	const [accountHistory, setAccountHistory] =
		useState<AccountHistoryPage | null>(initialData.accountHistory);
	const [anonymousHistory, setAnonymousHistory] = useState<
		HistorySummaryEntry[]
	>([]);
	// How many anonymous (localStorage) entries are currently revealed. Account
	// pagination is server-driven, so it only tracks accountHistory length.
	const [anonymousVisibleCount, setAnonymousVisibleCount] =
		useState(HISTORY_PAGE_SIZE);
	const [isLoadingMore, setIsLoadingMore] = useState(false);

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
				const hasLocalProgress =
					payload.historyEntries.length > 0 ||
					Object.keys(payload.activeProgressByDate).length > 0;

				try {
					const result = await importProgress({
						data: {
							deviceId,
							payload,
						},
					});
					markAnonymousDataImported(activeUser.id);
					if (hasLocalProgress) {
						captureEvent("anonymous_history_imported", {
							active_progress_count: Object.keys(payload.activeProgressByDate)
								.length,
							imported_dates: result.importedDates.length,
							legacy_dates: result.skippedLegacyDates.length,
						});
						toast.success("S'han sincronitzat els resultats locals");
					}
				} catch (error) {
					console.error("Failed to import anonymous history", error);
					captureException(error, {
						scope: "anonymous_history_import",
					});
				}
			}

			try {
				const data = await fetchHistory();
				if (!cancelled) {
					setAccountHistory(data.accountHistory);
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

	const entries = activeUser
		? (accountHistory?.entries ?? [])
		: anonymousHistory.slice(0, anonymousVisibleCount);

	const hasMore = activeUser
		? (accountHistory?.hasMore ?? false)
		: anonymousVisibleCount < anonymousHistory.length;

	// Account stats come precomputed from the server over the full history;
	// anonymous stats are derived locally from the complete localStorage set.
	const anonymousStats = useMemo(
		() => calculateHistoryStats(anonymousHistory),
		[anonymousHistory],
	);
	const stats = activeUser
		? (accountHistory?.stats ?? EMPTY_STATS)
		: anonymousStats;

	const handleLoadMore = async () => {
		if (isLoadingMore) {
			return;
		}

		if (!activeUser) {
			setAnonymousVisibleCount((count) => count + HISTORY_PAGE_SIZE);
			return;
		}

		setIsLoadingMore(true);
		try {
			const page = await fetchMoreHistory({
				data: { offset: accountHistory?.entries.length ?? 0 },
			});
			setAccountHistory((current) =>
				current
					? {
							...current,
							entries: [...current.entries, ...page.entries],
							hasMore: page.hasMore,
						}
					: current,
			);
		} catch (error) {
			console.error("Failed to load more history", error);
			captureException(error, {
				scope: "history_load_more",
			});
			toast.error("No s'han pogut carregar més resultats");
		} finally {
			setIsLoadingMore(false);
		}
	};

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
				<p className="text-sm text-muted-foreground font-ui">
					Consulta els resultats dels dies passats i el teu progrés.
				</p>

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
											className="flex min-h-24 flex-col rounded-xl bg-muted/50 px-3 py-3 sm:min-h-28 sm:px-4 sm:py-4"
										>
											<span className="text-xs text-muted-foreground font-medium leading-tight font-ui sm:text-sm">
												{stat.label}
											</span>
											<div className="mt-auto pt-2 text-2xl leading-none font-bold tabular-nums sm:text-3xl">
												{stat.value}
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
														{entry.difficulty ? (
															<DifficultyBars
																difficulty={entry.difficulty}
																showLabel
															/>
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
									{hasMore ? (
										<div className="flex justify-center pt-1">
											<Button
												variant="outline"
												onClick={handleLoadMore}
												disabled={isLoadingMore}
											>
												{isLoadingMore ? "Carregant…" : "Carrega'n més"}
											</Button>
										</div>
									) : null}
								</div>
							</>
						)}
					</div>

					<div className="order-1 lg:order-2">
						<div className="rounded-xl bg-muted/30 p-4 sm:p-5 space-y-4">
							<div className="space-y-1.5">
								<h3 className="text-base font-semibold">Resultat d'ahir</h3>
								<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
									<span className="text-sm text-muted-foreground font-ui">
										{dateFormatter.format(
											new Date(
												`${initialData.yesterdayPuzzle.dateKey}T12:00:00.000Z`,
											),
										)}
									</span>
									{initialData.yesterdayPuzzle.difficulty ? (
										<DifficultyBars
											difficulty={initialData.yesterdayPuzzle.difficulty}
											showLabel
										/>
									) : null}
								</div>
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
														className="aspect-square border rounded-[18%] flex items-center justify-center font-bold leading-none overflow-hidden text-[clamp(0.25rem,calc(42cqi/var(--cols)),0.95rem)] bg-primary/10 border-primary/30 text-foreground"
													>
														{cell.toUpperCase()}
													</div>
												);
											}),
									)}
								</div>
							</div>

							{initialData.yesterdayLeaderboard ? (
								<div className="space-y-3 border-t border-border/50 pt-4">
									<h4 className="text-base font-semibold">
										Classificació d'ahir
									</h4>
									<LeaderboardList
										entries={initialData.yesterdayLeaderboard.entries}
										emptyMessage="Ningú no va aparèixer ahir al rànquing."
									/>
								</div>
							) : null}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
