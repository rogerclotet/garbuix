import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { HELD_FOUND_WORD_MS } from "./puzzle-animation-timing";
import type { PuzzleSubmitFeedback } from "./puzzle-types";

function usePrefersReducedMotion(): boolean {
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

	useEffect(() => {
		if (
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function"
		) {
			return;
		}

		const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const updateReducedMotion = () => {
			setPrefersReducedMotion(mediaQuery.matches);
		};

		updateReducedMotion();
		mediaQuery.addEventListener("change", updateReducedMotion);

		return () => {
			mediaQuery.removeEventListener("change", updateReducedMotion);
		};
	}, []);

	return prefersReducedMotion;
}

// The input panel: the word being formed, with the verdict on the last guess
// flashing over it.
export function PuzzleGuessDisplay({
	currentGuess,
	submitFeedback,
	mini = false,
	quadrat = false,
}: {
	currentGuess: string;
	submitFeedback: PuzzleSubmitFeedback | null;
	mini?: boolean;
	// Holds a found word in the quadrat accent instead of flashing it.
	quadrat?: boolean;
}) {
	const prefersReducedMotion = usePrefersReducedMotion();
	const heldFoundWord = quadrat && submitFeedback?.kind === "new_word";
	const submitFeedbackToneClass =
		submitFeedback?.kind === "new_word"
			? mini
				? "text-teal-600 dark:text-teal-400"
				: quadrat
					? "text-[var(--quadrat-accent)]"
					: "text-primary"
			: submitFeedback?.kind === "valid_but_not_in_puzzle" ||
					(mini && submitFeedback?.kind === "already_found")
				? "text-muted-foreground opacity-65"
				: submitFeedback?.kind === "not_in_dictionary" ||
						submitFeedback?.kind === "invalid_input"
					? "text-destructive"
					: "text-foreground";

	return (
		<div className="relative w-full overflow-hidden h-9 sm:h-12 border-b-2 border-primary/60">
			<div className="absolute inset-0 flex items-center justify-center text-center text-xl font-bold tracking-widest uppercase sm:text-3xl">
				<span data-slot="current-guess">{currentGuess}</span>
				{submitFeedback ? (
					<span
						key={submitFeedback.id}
						data-feedback-kind={submitFeedback.kind}
						data-reduced-motion={prefersReducedMotion ? "true" : "false"}
						data-slot="submit-feedback"
						className={cn(
							"pointer-events-none absolute inset-0 flex items-center justify-center",
							heldFoundWord ? "held-found-word" : "daily-submit-feedback",
							submitFeedbackToneClass,
							prefersReducedMotion && "daily-submit-feedback-reduced-motion",
						)}
						style={
							heldFoundWord
								? { animationDuration: `${HELD_FOUND_WORD_MS}ms` }
								: undefined
						}
					>
						{heldFoundWord ? (
							<span className="flex items-center gap-[0.3em]">
								<Check className="size-[0.9em]" strokeWidth={3.5} aria-hidden />
								{submitFeedback.word}
							</span>
						) : (
							submitFeedback.word
						)}
					</span>
				) : null}
			</div>
		</div>
	);
}
