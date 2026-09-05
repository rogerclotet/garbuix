import {
	CornerDownLeft,
	Delete,
	Lightbulb,
	Shuffle,
	Sparkles,
} from "lucide-react";
import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LetterLayout } from "@/lib/anon-identity";
import { cn } from "@/lib/utils";
import type { DailySubmitFeedback } from "./daily-types";

const HINT_HOLD_MS = 600;

// Circle layout: every size below is derived from this one clamp, set as the
// --circle-key custom property on the wheel, so the keys, the submit button,
// the wheel itself, and the letters' font size all scale together and in
// proportion at any screen width instead of jumping between fixed sizes at
// the sm/md breakpoints.
const CIRCLE_KEY_SIZE = "clamp(3.25rem, 2.5rem + 3vw, 4rem)";
// Multiplier from key size to the distance between the wheel's center and
// each letter button, tuned so the six letters clear each other by the same
// margin whatever size the wheel ends up at.
const CIRCLE_RADIUS_FACTOR = 1.2;

// Row layout: every key plus the submit has to fit on one line at any width,
// so the key is sized from the width the row is actually given (--row-key, see
// rowStyle below) rather than from a fixed value. The cap is the size the keys
// used to have, so a wide phone still gets a keyboard rather than a handful of
// oversized buttons.
const ROW_MAX_KEY_REM = 3.25;
// Floor for the same clamp. Today's puzzles are always six letters, which fits
// down to the narrowest phone; the floor only keeps the width a valid length if
// a future puzzle carries enough keys to drive the division to zero.
const ROW_MIN_KEY_REM = 1.5;
const ROW_GAP_REM = 0.375;
// The submit sits a little apart from the letters; counted into the fit so the
// row still lands inside the panel.
const ROW_SUBMIT_GAP_REM = 0.25;

export type TutorialControlTarget =
	| { kind: "letter"; letter: string }
	| { kind: "submit" }
	| { kind: "hint" };

type DailyControlsProps = {
	inline?: boolean;
	tutorialTarget?: TutorialControlTarget;
	aiClueMode: boolean;
	// How the letters are arranged: around the submit button, in a three-column
	// grid, or in a single row. Independent of where the panel sits.
	layout: LetterLayout;
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
	inline = false,
	tutorialTarget,
	aiClueMode,
	layout,
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
	useEffect(
		() => () => {
			if (hintHoldFrameRef.current != null) {
				cancelAnimationFrame(hintHoldFrameRef.current);
			}
		},
		[],
	);
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
	// The grid has room for the full-size key on any board. The circle and the
	// row size their keys from a custom property instead (--circle-key and
	// --row-key, see the styles below).
	const keySizeClass = isRow
		? "shrink-0"
		: isCircle
			? "rounded-full"
			: "w-[3.25rem] h-[3.25rem] sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-lg sm:rounded-xl";
	const submitSizeClass = isRow
		? "ml-1 shrink-0"
		: isCircle
			? "rounded-full"
			: "w-14 h-14 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl";
	// Every letter plus the submit, and everything the row has to fit around
	// them: the gaps between the keys and the submit's extra breathing room.
	const rowKeyCount = shuffledLetters.length + 1;
	const rowReservedRem = (rowKeyCount - 1) * ROW_GAP_REM + ROW_SUBMIT_GAP_REM;
	const rowStyle: CSSProperties | undefined = isRow
		? ({
				gap: `${ROW_GAP_REM}rem`,
				"--row-key": `clamp(${ROW_MIN_KEY_REM}rem, calc((100cqi - ${rowReservedRem}rem) / ${rowKeyCount}), ${ROW_MAX_KEY_REM}rem)`,
			} as CSSProperties)
		: undefined;
	const rowSquareStyle: CSSProperties | undefined = isRow
		? {
				width: "var(--row-key)",
				height: "var(--row-key)",
				borderRadius: "calc(var(--row-key) * 0.31)",
			}
		: undefined;
	const keyStyle: CSSProperties | undefined = isCircle
		? {
				width: "var(--circle-key)",
				height: "var(--circle-key)",
				fontSize: "calc(var(--circle-key) * 0.4)",
			}
		: isRow
			? { ...rowSquareStyle, fontSize: "calc(var(--row-key) * 0.42)" }
			: undefined;
	const submitStyle: CSSProperties | undefined = isCircle
		? {
				width: "calc(var(--circle-key) + 0.5rem)",
				height: "calc(var(--circle-key) + 0.5rem)",
			}
		: rowSquareStyle;

	const renderLetterButton = (letter: string) => (
		<Button
			key={`letter-${letter}`}
			data-slot="letter-key"
			variant="outline"
			size="lg"
			className={cn(
				"daily-pressable daily-pressable-key font-bold border border-border bg-background transition-all duration-100 touch-manipulation",
				isCircle || isRow ? "" : "text-xl",
				keySizeClass,
				tutorialTarget?.kind === "letter" &&
					tutorialTarget.letter === letter &&
					"ring-2 ring-primary ring-offset-4 ring-offset-background bg-primary/10",
			)}
			style={keyStyle}
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
				tutorialTarget?.kind === "submit" &&
					"ring-2 ring-primary ring-offset-4 ring-offset-background",
			)}
			style={submitStyle}
			disabled={currentGuess.length < 4}
			aria-label="Comprovar"
		>
			<CornerDownLeft
				className={isRow ? "" : "h-5 w-5"}
				style={
					isRow
						? {
								width: "calc(var(--row-key) * 0.44)",
								height: "calc(var(--row-key) * 0.44)",
							}
						: undefined
				}
			/>
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
				onClick={(event) => {
					// Keyboard and assistive-technology activation has no pointer hold.
					if (event.detail === 0 && canUseHint) onHint();
				}}
				onContextMenu={(e) => e.preventDefault()}
				className={cn(
					"daily-pressable daily-pressable-action gap-2 h-9 sm:h-10 touch-manipulation relative overflow-hidden select-none",
					tutorialTarget?.kind === "hint" &&
						"ring-2 ring-amber-500 ring-offset-2 ring-offset-background bg-amber-500/10",
				)}
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
		<div
			className="relative shrink-0 overflow-visible"
			style={
				{
					"--circle-key": CIRCLE_KEY_SIZE,
					width: "calc(var(--circle-key) * 3.4)",
					height: "calc(var(--circle-key) * 3.4)",
				} as CSSProperties
			}
		>
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
				{submitButton}
			</div>
			{shuffledLetters.map((letter, index) => {
				const angle =
					(index / shuffledLetters.length) * 2 * Math.PI - Math.PI / 2;
				const x = (CIRCLE_RADIUS_FACTOR * Math.cos(angle)).toFixed(4);
				const y = (CIRCLE_RADIUS_FACTOR * Math.sin(angle)).toFixed(4);
				return (
					<div
						key={`letter-${letter}`}
						className="absolute"
						style={{
							left: "50%",
							top: "50%",
							transform: `translate(calc(-50% + var(--circle-key) * ${x}), calc(-50% + var(--circle-key) * ${y}))`,
						}}
					>
						{renderLetterButton(letter)}
					</div>
				);
			})}
		</div>
	) : isRow ? (
		// The outer box is the container --row-key measures against; an element
		// can't query its own size, so the row itself has to be the child.
		<div className="w-full [container-type:inline-size]">
			<div className="flex items-center justify-center" style={rowStyle}>
				{shuffledLetters.map((letter) => renderLetterButton(letter))}
				{submitButton}
			</div>
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
			className={
				inline
					? "relative w-full"
					: "fixed right-0 bottom-0 left-0 z-40 touch-none overscroll-none lg:static lg:shrink-0 lg:overflow-visible lg:touch-auto lg:overscroll-auto"
			}
		>
			<div
				className={
					inline
						? "select-none bg-background"
						: "rounded-t-2xl rounded-b-none border-t border-border/60 bg-background shadow-[0_-2px_12px_rgb(0,0,0,0.06)] dark:shadow-[0_-2px_12px_rgb(0,0,0,0.25)] pb-[env(safe-area-inset-bottom)] select-none lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none lg:dark:shadow-none lg:pb-0 lg:select-auto"
				}
			>
				<div className={inline ? "hidden" : "hidden lg:block lg:text-left"}>
					<h2 className="font-semibold leading-none tracking-tight">
						Endevina una paraula
					</h2>
					<p className="text-sm text-muted-foreground font-ui mt-2">
						Escriu amb el teclat, esborra amb retrocés i envia amb Enter o
						espai.
					</p>
				</div>
				<div className="p-2 lg:px-0 lg:pt-2">
					<div className="flex flex-col items-center gap-3 lg:gap-6">
						<div className="relative w-full overflow-hidden h-9 sm:h-12 border-b-2 border-primary/60">
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
