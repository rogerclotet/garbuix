import { formatPuzzleDate } from "@/lib/puzzle-dates";
import { getPuzzleNumber } from "@/lib/puzzle-number";

// The number counts daily Garbuix puzzles only, so other modes (mini,
// syllables) and days before #1 show just the date.
export function PuzzleTitle({
	dateKey,
	numbered = true,
}: {
	dateKey: string;
	numbered?: boolean;
}) {
	const number = numbered ? getPuzzleNumber(dateKey) : null;
	return (
		<div className="flex items-baseline justify-between gap-3 text-sm font-ui">
			{number === null ? null : (
				<span className="font-semibold">Garbuix #{number}</span>
			)}
			<span className="text-muted-foreground">{formatPuzzleDate(dateKey)}</span>
		</div>
	);
}
