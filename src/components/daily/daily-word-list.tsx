import { CheckCircle2 } from "lucide-react";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";
import { getDisplayedSlotWord, getSortedWordSlots } from "./daily-helpers";

type DailyWordListProps = {
	puzzle: DailyPuzzlePublic;
	guessedWordIds: number[];
	revealedAnswers: Record<number, string>;
	cellLetters: Map<string, string>;
	clueTextsByWordId?: Record<number, string>;
	clueWordIds?: number[];
};

export function DailyWordList({
	puzzle,
	guessedWordIds,
	revealedAnswers,
	cellLetters,
	clueTextsByWordId = {},
	clueWordIds = [],
}: DailyWordListProps) {
	const { foundSlots, notFoundSlots } = getSortedWordSlots(
		puzzle.wordSlots,
		guessedWordIds,
		cellLetters,
	);
	const cluedWordIds = new Set(clueWordIds);

	return (
		<div className="space-y-2 lg:max-h-96 lg:overflow-y-auto">
			{notFoundSlots.map((slot) => {
				const clueText = clueTextsByWordId[slot.id];
				const isHighlighted = cluedWordIds.has(slot.id);

				return (
					<div
						key={slot.id}
						className={`flex flex-col gap-1.5 py-2.5 px-3 rounded-lg ${
							isHighlighted ? "clue-gradient-border" : "bg-muted/40"
						}`}
					>
						<div className="flex items-center gap-2">
							<div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
							<span className="font-mono text-muted-foreground tracking-widest">
								{getDisplayedSlotWord(slot, cellLetters)}
							</span>
							<span className="text-xs text-muted-foreground ml-auto font-ui">
								{slot.length} lletres
							</span>
						</div>
						{clueText ? (
							<p className="text-sm italic text-muted-foreground pl-7 font-ui">
								{clueText}
							</p>
						) : null}
					</div>
				);
			})}

			{foundSlots.map((slot) => (
				<div
					key={slot.id}
					className="flex flex-col gap-2 rounded-lg bg-primary/8 py-2.5 px-3"
				>
					<div className="flex items-center gap-2">
						<CheckCircle2 className="w-5 h-5 shrink-0 text-primary" />
						<a
							href={`https://aplicacions.llengua.gencat.cat/llc/AppJava/index.html?action=Principal&method=cerca_generica&input_cercar=${encodeURIComponent(revealedAnswers[slot.id] ?? "")}&tipusCerca=cerca.queSignifica`}
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-foreground tracking-widest hover:underline"
						>
							{revealedAnswers[slot.id]?.toUpperCase()}
						</a>
						<span className="text-xs text-muted-foreground ml-auto font-ui">
							{slot.length} lletres
						</span>
					</div>
				</div>
			))}
		</div>
	);
}
