import {
	CornerDownLeft,
	Delete,
	Lightbulb,
	Shuffle,
	Sparkles,
} from "lucide-react";
import type { MouseEvent, PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DailySubmitFeedback } from "./daily-types";

const HINT_HOLD_MS = 600;

type DailyControlsProps = {
	aiClueMode: boolean;
	canUseHint: boolean;
	currentGuess: string;
	hintsUsed: number;
	isComplete: boolean;
	shuffledLetters: string[];
	onBackspace: () => void;
	onHint: () => void;
	onLetterClick: (letter: string) => void;
	onShuffle: () => void;
	onSubmitGuess: () => void;
	submitFeedback: DailySubmitFeedback | null;
	runClickAction: (
		event: MouseEvent<HTMLButtonElement>,
		action: () => void,
	) => void;
	runPressAction: (
		event: PointerEvent<HTMLButtonElement>,
		action: () => void,
	) => void;
};

export function DailyControls({
	aiClueMode,
	canUseHint,
	currentGuess,
	hintsUsed,
	isComplete,
	shuffledLetters,
	onBackspace,
	onHint,
	onLetterClick,
	onShuffle,
	onSubmitGuess,
	submitFeedback,
	runClickAction,
	runPressAction,
}: DailyControlsProps) {
	const [hintHoldProgress, setHintHoldProgress] = useState(0);
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
	const hintHoldFrameRef = useRef<number | null>(null);

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

	const cancelHintHold = () => {
		if (hintHoldFrameRef.current != null) {
			cancelAnimationFrame(hintHoldFrameRef.current);
			hintHoldFrameRef.current = null;
		}
		setHintHoldProgress(0);
	};

	const handleHintPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
		if (!canUseHint || isComplete) return;
		if (event.pointerType === "mouse" && event.button !== 0) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

		const startTime = performance.now();

		const tick = (now: number) => {
			const progress = Math.min((now - startTime) / HINT_HOLD_MS, 1);
			setHintHoldProgress(progress);

			if (progress < 1) {
				hintHoldFrameRef.current = requestAnimationFrame(tick);
			} else {
				hintHoldFrameRef.current = null;
				setHintHoldProgress(0);
				onHint();
			}
		};

		hintHoldFrameRef.current = requestAnimationFrame(tick);
	};

	if (isComplete) {
		return null;
	}

	const submitFeedbackToneClass =
		submitFeedback?.kind === "new_word"
			? "text-primary"
			: submitFeedback?.kind === "valid_but_not_in_puzzle"
				? "text-muted-foreground opacity-65"
				: submitFeedback?.kind === "not_in_dictionary" ||
						submitFeedback?.kind === "invalid_input"
					? "text-destructive"
					: "text-foreground";

	return (
		<div className="fixed right-0 bottom-0 left-0 z-40 touch-none overscroll-none lg:static lg:touch-auto lg:overscroll-auto">
			<div className="rounded-t-2xl rounded-b-none border-t border-border/60 bg-background shadow-[0_-2px_12px_rgb(0,0,0,0.06)] dark:shadow-[0_-2px_12px_rgb(0,0,0,0.25)] pb-[env(safe-area-inset-bottom)] select-none lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none lg:dark:shadow-none lg:pb-0 lg:select-auto">
				<div className="hidden lg:block lg:text-left">
					<h2 className="font-semibold leading-none tracking-tight">
						Endevina una paraula
					</h2>
					<p className="text-sm text-muted-foreground font-ui mt-2">
						Escriu amb el teclat, esborra amb retrocés i envia amb Enter o
						espai.
					</p>
				</div>
				<div className="p-6 lg:px-0 lg:pt-4">
					<div className="flex flex-col items-center gap-4 lg:gap-6">
						<div className="relative h-10 sm:h-12 w-full overflow-hidden border-b-2 border-primary/60">
							<div className="absolute inset-0 flex items-center justify-center text-center text-2xl font-bold tracking-widest uppercase sm:text-3xl">
								<span data-slot="current-guess">{currentGuess}</span>
								{submitFeedback ? (
									<span
										key={submitFeedback.id}
										data-feedback-kind={submitFeedback.kind}
										data-reduced-motion={
											prefersReducedMotion ? "true" : "false"
										}
										data-slot="submit-feedback"
										className={cn(
											"pointer-events-none absolute inset-0 flex items-center justify-center daily-submit-feedback",
											submitFeedbackToneClass,
											prefersReducedMotion &&
												"daily-submit-feedback-reduced-motion",
										)}
									>
										{submitFeedback.word}
									</span>
								) : null}
							</div>
						</div>

						<div className="flex items-center justify-evenly w-full gap-4 sm:gap-6">
							<div className="grid grid-cols-3 gap-2 sm:gap-3">
								{shuffledLetters.map((letter) => (
									<Button
										key={`letter-${letter}`}
										variant="outline"
										size="lg"
										className="daily-pressable daily-pressable-key w-[3.25rem] h-[3.25rem] sm:w-14 sm:h-14 md:w-16 md:h-16 text-xl font-bold rounded-lg sm:rounded-xl border border-border bg-background transition-all duration-100 touch-manipulation"
										onPointerDown={(event) =>
											runPressAction(event, () => onLetterClick(letter))
										}
										onPointerUp={(event) =>
											runPressAction(event, () => onLetterClick(letter))
										}
										onClick={(event) =>
											runClickAction(event, () => onLetterClick(letter))
										}
									>
										{letter.toUpperCase()}
									</Button>
								))}
							</div>

							<Button
								onPointerDown={(event) => runPressAction(event, onSubmitGuess)}
								onPointerUp={(event) => runPressAction(event, onSubmitGuess)}
								onClick={(event) => runClickAction(event, onSubmitGuess)}
								size="icon"
								className="daily-pressable daily-pressable-submit w-14 h-14 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl touch-manipulation"
								disabled={currentGuess.length < 4}
								aria-label="Comprovar"
							>
								<CornerDownLeft className="h-5 w-5" />
							</Button>
						</div>

						<div className="grid grid-cols-3 gap-2 sm:gap-4 w-full font-ui">
							<Button
								variant="ghost"
								onPointerDown={(event) => runPressAction(event, onBackspace)}
								onPointerUp={(event) => runPressAction(event, onBackspace)}
								onClick={(event) => runClickAction(event, onBackspace)}
								className="daily-pressable daily-pressable-action gap-2 h-9 sm:h-10 touch-manipulation"
								disabled={currentGuess.length === 0}
							>
								<Delete className="w-4 h-4" />
								Esborrar
							</Button>
							<Button
								variant="ghost"
								onPointerDown={handleHintPointerDown}
								onPointerUp={cancelHintHold}
								onPointerLeave={cancelHintHold}
								onPointerCancel={cancelHintHold}
								onContextMenu={(e) => e.preventDefault()}
								className="daily-pressable daily-pressable-action gap-2 h-9 sm:h-10 touch-manipulation relative overflow-hidden select-none"
								disabled={!canUseHint || isComplete}
								size="lg"
								aria-description={
									aiClueMode
										? "Mantén premut per rebre una pista de la IA"
										: "Mantén premut per revelar una lletra"
								}
							>
								<span
									className="absolute inset-0 bg-amber-400/25 origin-left"
									style={{ transform: `scaleX(${hintHoldProgress})` }}
									aria-hidden
								/>
								{aiClueMode ? (
									<Sparkles
										className={`relative w-4 h-4 ${canUseHint ? "text-amber-500" : "text-muted-foreground/40"}`}
									/>
								) : (
									<Lightbulb
										className={`relative w-4 h-4 ${canUseHint ? "text-amber-500" : "text-muted-foreground/40"}`}
									/>
								)}
								<span className="relative">Pista ({3 - hintsUsed})</span>
							</Button>
							<Button
								variant="ghost"
								onPointerDown={(event) => runPressAction(event, onShuffle)}
								onPointerUp={(event) => runPressAction(event, onShuffle)}
								onClick={(event) => runClickAction(event, onShuffle)}
								className="daily-pressable daily-pressable-action gap-2 h-9 sm:h-10 touch-manipulation"
							>
								<Shuffle className="w-4 h-4" />
								Barrejar
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
