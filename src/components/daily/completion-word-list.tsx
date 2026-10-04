import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { resolveFoundWords } from "@/lib/puzzle-client";
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
}: {
	query: ReturnType<typeof useCompletionWords>;
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
				<ul className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
					{words.map(({ word, isInPuzzle }) => (
						<li
							key={word}
							className={cn(
								"flex max-w-full items-center rounded border px-1.5 py-0.5 text-xs",
								isInPuzzle
									? "border-primary/25 bg-primary/10 font-semibold text-primary"
									: "border-border/60 bg-muted/40 text-muted-foreground",
							)}
						>
							<span className="min-w-0 wrap-anywhere">
								{word.toUpperCase()}
							</span>
							{isInPuzzle ? <span className="sr-only">, del joc</span> : null}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
