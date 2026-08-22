import {
	CornerDownLeft,
	Delete,
	Lightbulb,
	Shuffle,
	Sparkles,
} from "lucide-react";
import type { MouseEvent, PointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LetterLayout } from "@/lib/anon-identity";
import { cn } from "@/lib/utils";
import type { DailySubmitFeedback } from "./daily-types";

const HINT_HOLD_MS = 600;

// Distance in rem from the circle's center to each letter button. Sized so the
// six letters clear each other and the container stays compact on mobile.
const CIRCLE_RADIUS_REM = 4.25;

type DailyControlsProps = {
	aiClueMode: boolean;
	// How the letters are arranged: around the submit button, in a three-column
	// grid, or in a single row. Independent of where the panel sits.
	layout: LetterLayout;
	// Redesigned board: the panel sits in the page flow under the word rail
	// instead of being pinned to the bottom of the viewport, so it carries none
	// of the sheet chrome and stays as short as the layout allows.
	inFlow?: boolean;
	canUseHint: boolean;
	currentGuess: string;
	// Reports the panel's height, which the board above it needs to know: the
	// letters layout is a preference, so no constant covers all three.
	onHeightChange?: (height: number) => void;
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
	layout,
	inFlow = false,
	canUseHint,
	currentGuess,
	hintsUsed,
	isComplete,
	onHeightChange,
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
	// Measures the panel for as long as it is on screen. A finished puzzle
	// unmounts the keypad, and the cleanup hands its room back.
	const measurePanel = useCallback(
		(panel: HTMLDivElement | null) => {
			if (!onHeightChange || !panel) {
				return;
			}

			const observer = new ResizeObserver((entries) => {
				const entry = entries[0];
				if (!entry) return;
				onHeightChange(entry.borderBoxSize[0]?.blockSize ?? panel.offsetHeight);
			});

			observer.observe(panel);
			return () => {
				observer.disconnect();
				onHeightChange(0);
			};
		},
		[onHeightChange],
	);

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

	const isRow = layout === "line";
	const isCircle = layout === "circle";
	// The row packs seven keys across, so it uses its own smaller square; the
	// other two arrangements have room for the full-size key on any board.
	const keySizeClass = isRow
		? "size-[2.875rem] shrink-0 rounded-[0.9rem] sm:size-13"
		: cn(
				"w-[3.25rem] h-[3.25rem] sm:w-14 sm:h-14 md:w-16 md:h-16",
				isCircle ? "rounded-full" : "rounded-lg sm:rounded-xl",
			);
	const submitSizeClass = isRow
		? "ml-1 size-[2.875rem] shrink-0 rounded-[0.9rem] sm:size-13"
		: cn(
				"w-14 h-14 sm:w-16 sm:h-16",
				isCircle ? "rounded-full" : "rounded-lg sm:rounded-xl",
			);

	const renderLetterButton = (letter: string) => (
		<Button
			key={`letter-${letter}`}
			variant="outline"
			size="lg"
			className={cn(
				"daily-pressable daily-pressable-key text-xl font-bold border border-border bg-background transition-all duration-100 touch-manipulation",
				keySizeClass,
			)}
			onPointerDown={(event) =>
				runPressAction(event, () => onLetterClick(letter))
			}
			onPointerUp={(event) =>
				runPressAction(event, () => onLetterClick(letter))
			}
			onClick={(event) => runClickAction(event, () => onLetterClick(letter))}
		>
			{letter.toUpperCase()}
		</Button>
	);

	const submitButton = (
		<Button
			onPointerDown={(event) => runPressAction(event, onSubmitGuess)}
			onPointerUp={(event) => runPressAction(event, onSubmitGuess)}
			onClick={(event) => runClickAction(event, onSubmitGuess)}
			size="icon"
			className={cn(
				"daily-pressable daily-pressable-submit touch-manipulation",
				submitSizeClass,
			)}
			disabled={currentGuess.length < 4}
			aria-label="Comprovar"
		>
			<CornerDownLeft className="h-5 w-5" />
		</Button>
	);

	const actionButtons = (
		<>
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
		</>
	);

	// The keys themselves, without the surrounding actions: a wheel around the
	// submit button, a three-column grid, or one row that ends in the submit.
	const lettersLayout = isCircle ? (
		<div className="relative h-[12rem] w-[12rem] shrink-0 overflow-visible sm:h-[13rem] sm:w-[13rem]">
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
				{submitButton}
			</div>
			{shuffledLetters.map((letter, index) => {
				const angle =
					(index / shuffledLetters.length) * 2 * Math.PI - Math.PI / 2;
				const x = Math.cos(angle) * CIRCLE_RADIUS_REM;
				const y = Math.sin(angle) * CIRCLE_RADIUS_REM;
				return (
					<div
						key={`letter-${letter}`}
						className="absolute"
						style={{
							left: "50%",
							top: "50%",
							transform: `translate(calc(-50% + ${x}rem), calc(-50% + ${y}rem))`,
						}}
					>
						{renderLetterButton(letter)}
					</div>
				);
			})}
		</div>
	) : isRow ? (
		<div className="flex items-center justify-center gap-1.5">
			{shuffledLetters.map((letter) => renderLetterButton(letter))}
			{submitButton}
		</div>
	) : (
		<div className="grid grid-cols-3 gap-2 sm:gap-3">
			{shuffledLetters.map((letter) => renderLetterButton(letter))}
		</div>
	);

	// The keys plus the actions. The row stacks them, the wheel puts the actions
	// alongside it, and the grid keeps the submit beside the keys with the
	// actions spread underneath.
	const keypad = isRow ? (
		<div className="flex w-full flex-col gap-2">
			{lettersLayout}
			<div className="flex justify-center gap-2 font-ui">{actionButtons}</div>
		</div>
	) : isCircle ? (
		<div className="flex w-full items-center justify-center gap-4 overflow-visible sm:gap-6">
			<div className="flex flex-col-reverse gap-2 font-ui">{actionButtons}</div>
			{lettersLayout}
		</div>
	) : (
		<>
			<div className="flex items-center w-full gap-4 sm:gap-6 justify-evenly">
				{lettersLayout}
				{submitButton}
			</div>

			<div className="grid grid-cols-3 gap-2 sm:gap-4 w-full font-ui">
				{actionButtons}
			</div>
		</>
	);

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
		<div
			ref={measurePanel}
			className={cn(
				inFlow
					? "shrink-0 select-none"
					: "fixed right-0 bottom-0 left-0 z-40 touch-none overscroll-none lg:static lg:shrink-0 lg:overflow-visible lg:touch-auto lg:overscroll-auto",
			)}
		>
			<div
				className={cn(
					inFlow
						? "pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
						: "rounded-t-2xl rounded-b-none border-t border-border/60 bg-background shadow-[0_-2px_12px_rgb(0,0,0,0.06)] dark:shadow-[0_-2px_12px_rgb(0,0,0,0.25)] pb-[env(safe-area-inset-bottom)] select-none lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none lg:dark:shadow-none lg:pb-0 lg:select-auto",
				)}
			>
				<div className={cn("hidden lg:text-left", inFlow ? null : "lg:block")}>
					<h2 className="font-semibold leading-none tracking-tight">
						Endevina una paraula
					</h2>
					<p className="text-sm text-muted-foreground font-ui mt-2">
						Escriu amb el teclat, esborra amb retrocés i envia amb Enter o
						espai.
					</p>
				</div>
				<div className={cn(inFlow ? "px-2" : "p-2 lg:px-0 lg:pt-2")}>
					<div
						className={cn(
							"flex flex-col items-center",
							inFlow ? "gap-2" : "gap-3 lg:gap-6",
						)}
					>
						<div
							className={cn(
								"relative w-full overflow-hidden",
								inFlow ? "h-11" : "h-9 sm:h-12 border-b-2 border-primary/60",
							)}
						>
							<div className="absolute inset-0 flex items-center justify-center text-center text-xl font-bold tracking-widest uppercase sm:text-3xl">
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

						{keypad}
					</div>
				</div>
			</div>
		</div>
	);
}
