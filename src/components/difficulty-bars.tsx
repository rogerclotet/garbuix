import { useEffect, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	formatDifficultyPhrase,
	PUZZLE_DIFFICULTY_LABELS,
	PUZZLE_DIFFICULTY_LEVELS,
	PUZZLE_DIFFICULTY_SUMMARIES,
	type PuzzleDifficulty,
} from "@/lib/puzzle-difficulty";
import { cn } from "@/lib/utils";

// Ascending bar heights (signal-strength style), one per difficulty level.
const BAR_HEIGHTS = ["h-1.5", "h-2.5", "h-3.5"];
const BAR_POSITIONS = Array.from(
	{ length: PUZZLE_DIFFICULTY_LEVELS },
	(_, index) => index + 1,
);

type DifficultyBarsProps = {
	difficulty: PuzzleDifficulty | null | undefined;
	showLabel?: boolean;
	className?: string;
};

function useCoarsePointer(): boolean {
	const [coarsePointer, setCoarsePointer] = useState(false);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(hover: none), (pointer: coarse)");
		const update = () => setCoarsePointer(mediaQuery.matches);
		update();
		mediaQuery.addEventListener("change", update);
		return () => mediaQuery.removeEventListener("change", update);
	}, []);

	return coarsePointer;
}

function DifficultyTooltipContent({
	difficulty,
}: {
	difficulty: PuzzleDifficulty;
}) {
	const phrase = formatDifficultyPhrase(difficulty);

	return (
		<div className="space-y-1 text-left">
			<p className="font-medium">{phrase}</p>
			<p className="text-background/85">
				{PUZZLE_DIFFICULTY_SUMMARIES[difficulty]}
			</p>
		</div>
	);
}

// Renders the puzzle's difficulty as 1-3 bars with an optional label. Monochrome
// (inherits the surrounding text color): the filled bars are solid, the rest are
// outlined. Returns null when difficulty is unknown (legacy/anonymous entries,
// or puzzles not yet backfilled) so callers can drop it in without guarding.
export function DifficultyBars({
	difficulty,
	showLabel = false,
	className,
}: DifficultyBarsProps) {
	const [open, setOpen] = useState(false);
	const coarsePointer = useCoarsePointer();

	if (difficulty == null) {
		return null;
	}

	const label = PUZZLE_DIFFICULTY_LABELS[difficulty];
	const phrase = formatDifficultyPhrase(difficulty);

	return (
		<Tooltip
			open={coarsePointer ? open : undefined}
			onOpenChange={coarsePointer ? setOpen : undefined}
		>
			<TooltipTrigger asChild>
				<button
					type="button"
					className={cn(
						"inline-flex cursor-help items-center gap-1.5 border-0 bg-transparent p-0 font-ui text-foreground",
						className,
					)}
					aria-label={phrase}
					onPointerDown={(event) => {
						if (coarsePointer) {
							event.preventDefault();
						}
					}}
					onClick={() => {
						if (coarsePointer) {
							setOpen((current) => !current);
						}
					}}
				>
					<span
						className="inline-flex h-3.5 items-end gap-[3px]"
						aria-hidden="true"
					>
						{BAR_POSITIONS.map((position) => (
							<span
								key={position}
								className={cn(
									"w-1.5 rounded-[2px]",
									BAR_HEIGHTS[position - 1],
									position <= difficulty
										? "bg-foreground"
										: "border border-foreground/40",
								)}
							/>
						))}
					</span>
					{showLabel ? (
						<span className="text-xs font-medium">{label}</span>
					) : null}
				</button>
			</TooltipTrigger>
			<TooltipContent
				side="bottom"
				align="start"
				className="max-w-xs flex-col items-start text-balance"
			>
				<DifficultyTooltipContent difficulty={difficulty} />
			</TooltipContent>
		</Tooltip>
	);
}
