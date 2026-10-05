import { getDisplayedSlotWord } from "@/lib/puzzle-helpers";
import type { PuzzleWordSlot } from "@/lib/puzzle-types";

export function SimpleWordList({
	wordSlots,
	guessedWordIds,
	cellLetters,
	onWordTap,
}: {
	wordSlots: PuzzleWordSlot[];
	guessedWordIds: number[];
	cellLetters: Map<string, string>;
	onWordTap: (wordId: number) => void;
}) {
	return (
		<section aria-label="Les cinc paraules" className="shrink-0">
			<ul className="flex flex-wrap justify-center gap-x-3 gap-y-1">
				{wordSlots.map((slot) => {
					const found = guessedWordIds.includes(slot.id);
					const word = getDisplayedSlotWord(slot, cellLetters);
					return (
						<li key={slot.id} className="max-w-full">
							<button
								type="button"
								onClick={() => onWordTap(slot.id)}
								className={`max-w-full cursor-pointer text-sm font-semibold leading-5 tracking-wider wrap-anywhere hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${found ? "text-primary" : "text-muted-foreground"}`}
								aria-label={`${word}, ${found ? "trobada" : `${slot.length} ${slot.cellLengths ? "síl·labes" : "lletres"}`}. Mostra al tauler.`}
							>
								{word}
							</button>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
