import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { resolveFoundWords } from "@/lib/puzzle-client";
import { isPangram } from "@/lib/puzzle-helpers";
import { cn } from "@/lib/utils";

export function useCompletionWords({
	enabled,
	...props
}: Parameters<typeof resolveFoundWords>[0] & { enabled: boolean }) {
	return useQuery({
		queryKey: [
			"completion-words",
			props.puzzle.id,
			props.puzzle.validNormalizedGuesses,
			props.guessHashes,
			props.revealedAnswers,
		],
		queryFn: () => resolveFoundWords(props),
		enabled,
		staleTime: Infinity,
		// These words are recovered locally and remain available offline.
		networkMode: "always",
	});
}

export function CompletionWordList({
	query,
	displayWords = {},
	pangramLetters,
}: {
	query: ReturnType<typeof useCompletionWords>;
	displayWords?: Readonly<Record<string, string>>;
	// The letters of the day. Only the classic game has pangrams, so the other
	// games leave this out.
	pangramLetters?: string[];
}) {
	const { data: words, isPending, isError, refetch } = query;

	return (
		<section aria-label="Paraules trobades" className="min-w-0">
			{isPending ? (
				<p role="status" className="text-sm text-muted-foreground font-ui">
					Carregant les paraules…
				</p>
			) : isError ? (
				<div className="text-sm font-ui">
					<p>No s'han pogut carregar les paraules.</p>
					<Button variant="text" size="sm" onClick={() => void refetch()}>
						Torna-ho a provar
					</Button>
				</div>
			) : (
				// Nunito's glyph box at 13px is ~17.7px tall, so any tighter line height
				// spills a pixel past the last row and the list scrolls for nothing.
				<ul className="flex max-h-32 flex-wrap justify-center gap-x-2 overflow-y-auto">
					{words.map(({ word, isInPuzzle }) => {
						const isPangramWord =
							pangramLetters !== undefined && isPangram(word, pangramLetters);
						return (
							<li
								key={word}
								className={cn(
									"max-w-full text-[13px] leading-[18px]",
									isInPuzzle
										? "font-extrabold text-primary"
										: "text-muted-foreground",
									isPangramWord && "text-pangram-foreground",
								)}
							>
								<span className="min-w-0 wrap-anywhere">
									{(displayWords[word] ?? word).toUpperCase()}
								</span>
								{isInPuzzle ? <span className="sr-only">, del joc</span> : null}
								{isPangramWord ? (
									<span className="sr-only">, pangrama</span>
								) : null}
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

export function CompletedPuzzleWordList({
	displayWords,
	...props
}: Omit<Parameters<typeof useCompletionWords>[0], "enabled"> & {
	displayWords?: Readonly<Record<string, string>>;
}) {
	const query = useCompletionWords({ ...props, enabled: true });
	return (
		<div className="shrink-0">
			<CompletionWordList query={query} displayWords={displayWords} />
		</div>
	);
}
