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

	return (
		<div className="space-y-2 lg:max-h-96 lg:overflow-y-auto">
			{puzzle.wordSlots
				.filter((slot) => guessedWordIdSet.has(slot.id))
				.map((slot) => (
					<div
						key={slot.id}
						className="flex flex-col gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20"
					>
						<div className="flex items-center gap-2">
							<CheckCircle2 className="w-5 h-5 shrink-0 text-green-600 dark:text-green-400" />
							<a
								href={`https://aplicacions.llengua.gencat.cat/llc/AppJava/index.html?action=Principal&method=cerca_generica&input_cercar=${encodeURIComponent(revealedAnswers[slot.id] ?? "")}&tipusCerca=cerca.queSignifica`}
								target="_blank"
								rel="noopener noreferrer"
								className="font-medium text-green-900 dark:text-green-300 tracking-widest hover:underline"
							>
								{revealedAnswers[slot.id]?.toUpperCase()}
							</a>
							<span className="text-xs text-green-600 dark:text-green-400 ml-auto">
								{slot.length} lletres
							</span>
						</div>
					</div>
				))}

			{puzzle.wordSlots
				.filter((slot) => !guessedWordIdSet.has(slot.id))
				.map((slot) => (
					<div
						key={slot.id}
						className="flex items-center gap-2 p-3 rounded-lg border bg-border/20"
					>
						<div className="w-5 h-5 rounded-full border-2 shrink-0" />
						<span className="font-mono text-muted-foreground tracking-widest">
							{getDisplayedSlotWord(slot, cellLetters)}
						</span>
						<span className="text-xs ml-auto">{slot.length} lletres</span>
					</div>
				))}
		</div>
	);
}
