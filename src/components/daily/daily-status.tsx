import {
	type PuzzleProgressState,
	WORDS_PER_BONUS_CLUE,
} from "@/lib/puzzle-types";

export function DailyStatus({
	progress,
	totalWords,
	displayComplete,
	currentStreak,
	bonusCluesEnabled,
}: {
	progress: PuzzleProgressState;
	totalWords: number;
	displayComplete: boolean;
	currentStreak: number;
	bonusCluesEnabled: boolean;
}) {
	if (displayComplete)
		return (
			<div className="space-y-1">
				<p className="text-sm font-medium text-muted-foreground font-ui">
					Felicitats!
				</p>
				<h2 className="text-xl font-semibold tracking-tight">
					Has completat el joc
				</h2>
				<div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm font-medium text-muted-foreground font-ui">
					<span>
						{progress.guessCount} intent
						{progress.guessCount === 1 ? "" : "s"}
					</span>
					<span>
						{progress.hintsUsed === 1
							? `${progress.hintsUsed} pista`
							: `${progress.hintsUsed} pistes`}
					</span>
					{currentStreak >= 3 ? (
						<span>Ratxa: {currentStreak} dies 🔥</span>
					) : null}
				</div>
			</div>
		);

	const percent = Math.min(
		100,
		Math.max(0, (progress.guessedWordIds.length / totalWords) * 100),
	);
	// Bottom meter fills 0→WORDS_PER_BONUS_CLUE toward the next bonus
	// clue and resets each time one is earned; the label keeps the total.
	const bonusCount = progress.bonusWordsFound;
	const bonusInCycle = bonusCount % WORDS_PER_BONUS_CLUE;
	const bonusPercent = (bonusInCycle / WORDS_PER_BONUS_CLUE) * 100;
	const wordsToNextClue = WORDS_PER_BONUS_CLUE - bonusInCycle;
	return (
		<div className="flex flex-col overflow-hidden rounded-lg">
			<div
				className="relative h-9 overflow-hidden bg-muted/40"
				role="progressbar"
				aria-valuenow={progress.guessedWordIds.length}
				aria-valuemin={0}
				aria-valuemax={totalWords}
				aria-label="Paraules trobades"
			>
				<div
					className="absolute inset-y-0 left-0 bg-primary/15 transition-[width] duration-500 ease-out"
					style={{ width: `${percent}%` }}
				/>
				<div className="relative flex h-full items-center justify-between gap-2 px-2.5 text-[11px] font-semibold font-ui">
					<span className="flex items-baseline gap-1">
						<span className="text-foreground tabular-nums text-xs">
							{progress.guessedWordIds.length}
						</span>
						<span className="text-muted-foreground/50">/</span>
						<span className="text-muted-foreground tabular-nums">
							{totalWords}
						</span>
						<span className="ml-1 hidden text-muted-foreground sm:inline">
							paraules
						</span>
					</span>
					<span className="text-muted-foreground tabular-nums">
						{progress.guessCount}{" "}
						{progress.guessCount === 1 ? "intent" : "intents"}
					</span>
				</div>
			</div>
			{bonusCluesEnabled ? (
				<div
					className="relative h-6 overflow-hidden bg-blue-500/10 dark:bg-blue-400/10"
					role="progressbar"
					aria-valuenow={bonusInCycle}
					aria-valuemin={0}
					aria-valuemax={WORDS_PER_BONUS_CLUE}
					aria-label="Paraules vàlides de fora del joc"
				>
					<div
						className="absolute inset-y-0 left-0 bg-blue-500/25 transition-[width] duration-500 ease-out"
						style={{ width: `${bonusPercent}%` }}
					/>
					<div className="relative flex h-full items-center justify-between gap-2 px-2.5 text-[11px] font-semibold font-ui">
						<span className="flex items-baseline gap-1">
							<span className="tabular-nums text-xs text-blue-700 dark:text-blue-300">
								{bonusCount}
							</span>
							<span className="ml-1 hidden text-blue-700/70 dark:text-blue-300/70 sm:inline">
								paraules extra
							</span>
						</span>
						<span className="tabular-nums text-blue-700/70 dark:text-blue-300/70">
							{wordsToNextClue} per a una lletra
						</span>
					</div>
				</div>
			) : null}
		</div>
	);
}
