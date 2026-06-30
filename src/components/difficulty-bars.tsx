import {
	PUZZLE_DIFFICULTY_LEVELS,
	type PuzzleDifficulty,
} from "@/lib/puzzle-difficulty";
import { cn } from "@/lib/utils";

const DIFFICULTY_LABELS: Record<PuzzleDifficulty, string> = {
	1: "Fàcil",
	2: "Mitjà",
	3: "Difícil",
};

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

// Renders the puzzle's difficulty as 1-3 bars with an optional label. Monochrome
// (inherits the surrounding text color): the filled bars are solid, the rest are
// outlined. Returns null when difficulty is unknown (legacy/anonymous entries,
// or puzzles not yet backfilled) so callers can drop it in without guarding.
export function DifficultyBars({
	difficulty,
	showLabel = false,
	className,
}: DifficultyBarsProps) {
	if (difficulty == null) {
		return null;
	}

	const label = DIFFICULTY_LABELS[difficulty];

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 font-ui text-foreground",
				className,
			)}
			role="img"
			aria-label={`Dificultat: ${label} (${difficulty} de ${PUZZLE_DIFFICULTY_LEVELS})`}
			title={`Dificultat: ${label}`}
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
			{showLabel ? <span className="text-xs font-medium">{label}</span> : null}
		</span>
	);
}
