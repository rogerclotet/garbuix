import { CheckCircle2 } from "lucide-react";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";
import { getDisplayedSlotWord } from "./daily-helpers";

type DailyWordListProps = {
	puzzle: DailyPuzzlePublic;
	guessedWordIds: number[];
	revealedAnswers: Record<number, string>;
	cellLetters: Map<string, string>;
};

export function DailyWordList({
	puzzle,
	guessedWordIds,
	revealedAnswers,
	cellLetters,
}: DailyWordListProps) {
	const guessedWordIdSet = new Set(guessedWordIds);

	// Found words: most recently found first (first found ends up at the bottom)
	const foundSlots = puzzle.wordSlots
		.filter((slot) => guessedWordIdSet.has(slot.id))
		.sort(
			(a, b) => guessedWordIds.indexOf(b.id) - guessedWordIds.indexOf(a.id),
		);

	// Not found words: fewest revealed letters first, then shortest word first
	const notFoundSlots = puzzle.wordSlots
		.filter((slot) => !guessedWordIdSet.has(slot.id))
		.sort((a, b) => {
			const aAvailable = getDisplayedSlotWord(a, cellLetters)
				.split("")
				.filter((c) => c !== "_").length;
			const bAvailable = getDisplayedSlotWord(b, cellLetters)
				.split("")
				.filter((c) => c !== "_").length;
			if (aAvailable !== bAvailable) return bAvailable - aAvailable;
			return a.length - b.length;
		});

	return (
		<div className="space-y-2 lg:max-h-96 lg:overflow-y-auto">
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

			{notFoundSlots.map((slot) => (
				<div
					key={slot.id}
					className="flex items-center gap-2 py-2.5 px-3 rounded-lg bg-muted/40"
				>
					<div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
					<span className="font-mono text-muted-foreground tracking-widest">
						{getDisplayedSlotWord(slot, cellLetters)}
					</span>
					<span className="text-xs text-muted-foreground ml-auto font-ui">
						{slot.length} lletres
					</span>
				</div>
			))}
		</div>
	);
}
