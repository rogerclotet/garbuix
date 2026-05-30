import { CheckCircle2, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";
import { getDisplayedSlotWord, getSortedWordSlots } from "./daily-helpers";

type DailyWordListProps = {
	puzzle: DailyPuzzlePublic;
	guessedWordIds: number[];
	revealedAnswers: Record<number, string>;
	cellLetters: Map<string, string>;
	clueTextsByWordId?: Record<number, string>;
	clueWordIds?: number[];
	foundClueTextsByWordId?: Record<number, string>;
	onWordTap?: (wordId: number) => void;
	// Peer clue requests: when out of hints, let the player ask other players for
	// help on a specific unfound word.
	canRequestHelp?: boolean;
	requestedHelpWordIds?: number[];
	peerClueTextsByWordId?: Record<number, string>;
	onRequestHelp?: (wordId: number) => void;
};

export function DailyWordList({
	puzzle,
	guessedWordIds,
	revealedAnswers,
	cellLetters,
	clueTextsByWordId = {},
	clueWordIds = [],
	foundClueTextsByWordId = {},
	onWordTap,
	canRequestHelp = false,
	requestedHelpWordIds = [],
	peerClueTextsByWordId = {},
	onRequestHelp,
}: DailyWordListProps) {
	const { foundSlots, notFoundSlots } = getSortedWordSlots(
		puzzle.wordSlots,
		guessedWordIds,
		cellLetters,
	);
	const cluedWordIds = new Set(clueWordIds);
	const requestedHelp = new Set(requestedHelpWordIds);

	return (
		<div className="space-y-2 lg:max-h-96 lg:overflow-y-auto">
			{notFoundSlots.map((slot) => {
				const clueText = clueTextsByWordId[slot.id];
				const peerClueText = peerClueTextsByWordId[slot.id];
				const isHighlighted =
					cluedWordIds.has(slot.id) || Boolean(peerClueText);
				const isWaitingForHelp = requestedHelp.has(slot.id) && !peerClueText;

				return (
					<div
						key={slot.id}
						className={`flex flex-col gap-1.5 py-2.5 px-3 rounded-lg w-full ${
							isHighlighted ? "clue-gradient-border" : "bg-muted/40"
						}`}
					>
						<button
							type="button"
							onClick={() => onWordTap?.(slot.id)}
							className="flex items-center gap-2 w-full text-left cursor-pointer"
						>
							<div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
							<span className="font-mono text-muted-foreground tracking-widest">
								{getDisplayedSlotWord(slot, cellLetters)}
							</span>
							<span className="text-xs text-muted-foreground ml-auto font-ui">
								{slot.length} lletres
							</span>
						</button>
						{clueText ? (
							<span className="block text-sm italic text-muted-foreground pl-7 font-ui">
								{clueText}
							</span>
						) : null}
						{peerClueText ? (
							<span className="block text-sm italic text-foreground pl-7 font-ui">
								{peerClueText}
							</span>
						) : null}
						{canRequestHelp ? (
							<div className="pl-7">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 gap-1.5 px-2 text-xs font-ui text-muted-foreground hover:text-foreground"
									disabled={isWaitingForHelp}
									onClick={() => onRequestHelp?.(slot.id)}
								>
									{isWaitingForHelp ? (
										<>
											<Loader2 className="size-3.5 animate-spin" />
											Esperant pista…
										</>
									) : (
										<>
											<Users className="size-3.5" />
											Demana ajuda
										</>
									)}
								</Button>
							</div>
						) : null}
					</div>
				);
			})}

			{foundSlots.map((slot) => {
				const foundClueText = foundClueTextsByWordId[slot.id];

				return (
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
						{foundClueText ? (
							<span className="block text-sm italic text-muted-foreground pl-7 font-ui">
								{foundClueText}
							</span>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
