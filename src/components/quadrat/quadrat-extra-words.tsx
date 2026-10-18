import { useCompletionWords } from "@/components/daily/completion-word-list";
import type { PuzzleProgressState } from "@/lib/puzzle-types";
import type { QuadratPuzzlePublic } from "@/lib/quadrat-types";

// Valid words the player traced that were not among the day's fifteen,
// shown once the board is done.
export function QuadratExtraWords({
	puzzle,
	guessHashes,
	revealedAnswers,
}: {
	puzzle: QuadratPuzzlePublic;
	guessHashes: PuzzleProgressState["guessHashes"];
	revealedAnswers: Record<number, string>;
}) {
	const { data: words } = useCompletionWords({
		puzzle,
		guessHashes,
		revealedAnswers,
		enabled: true,
	});
	const extras = words?.filter(({ isInPuzzle }) => !isInPuzzle) ?? [];
	if (extras.length === 0) return null;

	return (
		<section aria-label="Paraules extra" className="mt-6 px-1">
			<h4 className="mb-2 flex items-center justify-between text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground font-ui">
				Paraules extra <span className="tabular-nums">{extras.length}</span>
			</h4>
			<ul className="flex flex-wrap gap-x-2 text-[13px] leading-[18px] text-muted-foreground">
				{extras.map(({ word }) => (
					<li key={word}>{word.toUpperCase()}</li>
				))}
			</ul>
		</section>
	);
}
