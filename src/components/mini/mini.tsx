import { Link } from "@tanstack/react-router";
import { Check, PartyPopper, Star } from "lucide-react";
import {
	type CSSProperties,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { useMiniProgress } from "@/components/mini/use-mini-progress";
import { PuzzleConfetti } from "@/components/puzzle/puzzle-confetti";
import { PuzzleControls } from "@/components/puzzle/puzzle-controls";
import { PuzzleGrid } from "@/components/puzzle/puzzle-grid";
import { PuzzleLoadingPage } from "@/components/puzzle/puzzle-loading";
import { useDailyRollover } from "@/components/puzzle/use-daily-rollover";
import { useDecodedProgress } from "@/components/puzzle/use-decoded-progress";
import { usePuzzleKeyboard } from "@/components/puzzle/use-puzzle-keyboard";
import { Button } from "@/components/ui/button";
import { getMiniPageData } from "@/lib/mini-server-fns";
import { createPuzzleEvent, resolveGuess } from "@/lib/puzzle-client";
import {
	buildCellLetters,
	buildRevealedCells,
	getDisplayedSlotWord,
	getRandomHintCellKey,
	getWordCellKeys,
} from "@/lib/puzzle-helpers";
import { shuffleArray } from "@/lib/shuffle";
import { useObservability } from "@/lib/use-observability";

export type MiniPageData = Awaited<ReturnType<typeof getMiniPageData>>;

export function Mini({ initialData }: { initialData: MiniPageData }) {
	const [data, setData] = useState(initialData);
	const refresh = useCallback(async () => {
		setData(await getMiniPageData());
	}, []);
	const expired = useDailyRollover(data.rolloverAt, refresh);
	return (
		<MiniGame
			key={`${data.puzzle.id}:${data.userId}`}
			data={data}
			expired={expired}
		/>
	);
}

function MiniGame({ data, expired }: { data: MiniPageData; expired: boolean }) {
	const { puzzle, userId } = data;
	const { captureEvent } = useObservability();
	const { progress, ready, dispatch, syncFailed } = useMiniProgress({
		puzzle,
		initialProgress: data.progress,
		userId,
	});
	const decoded = useDecodedProgress({
		puzzle,
		progress,
		userId,
		enabled: ready,
	});
	const [guess, setGuess] = useState("");
	const [message, setMessage] = useState(
		"Toca les lletres per formar una paraula.",
	);
	const [highlightedWordId, setHighlightedWordId] = useState<number | null>(
		null,
	);
	const [locateId, setLocateId] = useState<number | null>(null);
	const [celebrate, setCelebrate] = useState(false);
	const [busy, setBusy] = useState(false);
	const [panelHeight, setPanelHeight] = useState<number | null>(null);
	const boardRef = useRef<HTMLDivElement>(null);
	const measurePanel = useCallback((panel: HTMLDivElement | null) => {
		if (!panel) return;
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			setPanelHeight(entry.borderBoxSize[0]?.blockSize ?? panel.offsetHeight);
		});
		observer.observe(panel);
		return () => observer.disconnect();
	}, []);
	const submitting = useRef(false);
	const snapshot = decoded.snapshot;
	const isPresentable = snapshot !== null;
	const visibleProgress = snapshot?.progress ?? progress;
	const complete = visibleProgress.completedAt !== null;
	const cellLetters = buildCellLetters(
		puzzle.wordSlots,
		snapshot?.answers ?? {},
		snapshot?.hints ?? {},
	);
	const revealedCells = buildRevealedCells(puzzle, progress);
	const canUseHint =
		ready &&
		!complete &&
		puzzle.hintCapsules.some(({ cellKey }) => !revealedCells.has(cellKey));
	const locateSlot = puzzle.wordSlots.find((slot) => slot.id === locateId);

	const appendLetter = useCallback((letter: string) => {
		setGuess((current) =>
			current.length < 5 ? current + letter.toUpperCase() : current,
		);
	}, []);
	const submit = useCallback(async () => {
		if (
			!isPresentable ||
			expired ||
			progress.completedAt ||
			guess.length < 3 ||
			submitting.current
		)
			return;
		submitting.current = true;
		setBusy(true);
		try {
			const result = await resolveGuess({ puzzle, progress, guess });
			dispatch(
				createPuzzleEvent("guess_added", {
					guessHash: result.guessHash,
					matchedWordId: result.matchedSlotId,
					unlockToken: result.unlockToken,
				}),
			);
			setGuess("");
			if (result.kind === "new_word") {
				setMessage(`Molt bé! Has trobat ${result.displayWord?.toUpperCase()}.`);
				setHighlightedWordId(result.matchedSlotId);
				if (progress.guessedWordIds.length + 1 === puzzle.wordSlots.length) {
					setCelebrate(true);
				}
			} else if (result.kind === "already_found")
				setMessage("Aquesta ja l'has trobada. Prova'n una altra!");
			else setMessage("Prova una altra paraula. Pots demanar una pista!");
		} catch {
			toast.error("No s'ha pogut comprovar la paraula. Torna-ho a provar.");
		} finally {
			submitting.current = false;
			setBusy(false);
		}
	}, [dispatch, expired, guess, isPresentable, progress, puzzle]);

	usePuzzleKeyboard({
		enabled: isPresentable && !expired && !complete,
		letters: puzzle.letters,
		guess,
		minimumGuessLength: 3,
		isBusy: () => submitting.current,
		onLetter: appendLetter,
		onBackspace: () => setGuess((current) => current.slice(0, -1)),
		onSubmit: () => {
			void submit();
		},
	});

	useEffect(() => {
		if (highlightedWordId === null && locateId === null) return;
		const timer = window.setTimeout(() => {
			setHighlightedWordId(null);
			setLocateId(null);
		}, 1400);
		return () => clearTimeout(timer);
	}, [highlightedWordId, locateId]);

	const hint = () => {
		if (!canUseHint || expired || busy) return;
		const cellKey = getRandomHintCellKey(puzzle, revealedCells);
		if (!cellKey) return;
		dispatch(createPuzzleEvent("hint_used", { cellKey }));
		captureEvent({ event: "hint_requested", value: "letter" });
		setMessage("Una lletra més! Mira on ha aparegut.");
	};

	const shuffle = () => {
		if (!ready || complete || expired || busy) return;
		dispatch(
			createPuzzleEvent("letters_shuffled", {
				shuffledLetters: shuffleArray(progress.shuffledLetters),
			}),
		);
		captureEvent({ event: "letters_shuffled" });
	};

	if (!isPresentable) {
		return (
			<PuzzleLoadingPage
				synchronizing={Boolean(userId)}
				onRetry={decoded.hasError ? decoded.retry : undefined}
			/>
		);
	}

	const layoutStyle: CSSProperties & { "--mini-panel-h": string } = {
		"--mini-panel-h": complete
			? "0px"
			: panelHeight === null
				? "20rem"
				: `${panelHeight}px`,
	};

	return (
		<div
			className="mini-game mx-auto h-full max-w-4xl px-4 pt-2 lg:flex lg:h-auto lg:min-h-full lg:flex-col lg:px-6 lg:pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:pt-6"
			style={layoutStyle}
		>
			<PuzzleConfetti fire={celebrate} />
			{/* The word list starts behind the fixed panel and scrolls clear of it. */}
			<div className="flex h-[calc(100%_-_var(--mini-panel-h))] flex-col gap-2 pb-2 lg:contents">
				<div
					className="flex shrink-0 justify-center gap-1 lg:mb-4"
					role="img"
					aria-label={`${visibleProgress.guessedWordIds.length} de 5 paraules trobades`}
				>
					{puzzle.wordSlots.map((slot, index) => (
						<Star
							key={slot.id}
							aria-hidden
							className={`size-5 sm:size-6 ${index < visibleProgress.guessedWordIds.length ? "fill-[var(--mini-gold)] text-[var(--mini-gold)]" : "text-border"}`}
						/>
					))}
				</div>
				{expired ? (
					<p role="status">Estem preparant el nou Garbuixmini...</p>
				) : null}
				{syncFailed ? (
					<p role="status" className="mb-2 text-sm text-muted-foreground">
						Progrés desat al navegador. Es sincronitzarà quan torni la connexió.
					</p>
				) : null}
				{decoded.hasError ? (
					<Button variant="outline" onClick={decoded.retry}>
						Torna a carregar les lletres
					</Button>
				) : null}
				<div className="contents lg:grid lg:flex-1 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-8">
					<div
						ref={boardRef}
						className="mx-auto flex min-h-0 w-full max-w-sm flex-1 lg:aspect-square lg:max-w-md"
					>
						<PuzzleGrid
							fitHeight
							puzzle={puzzle}
							revealedCells={new Set(cellLetters.keys())}
							cellLetters={cellLetters}
							highlightedWordId={highlightedWordId}
							locateCells={locateSlot ? getWordCellKeys(locateSlot) : undefined}
						/>
					</div>
					<div
						ref={complete ? undefined : measurePanel}
						className={
							complete
								? "shrink-0"
								: "fixed inset-x-0 bottom-0 z-40 touch-none overscroll-none space-y-1 rounded-t-2xl border-t border-border/60 bg-background px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-2px_12px_rgb(0,0,0,0.06)] dark:shadow-[0_-2px_12px_rgb(0,0,0,0.25)] lg:static lg:touch-auto lg:overscroll-auto lg:space-y-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:dark:shadow-none"
						}
					>
						{complete ? (
							<div className="rounded-3xl bg-primary/10 p-6 text-center">
								<PartyPopper
									aria-hidden
									className="mx-auto mb-3 size-10 text-[var(--mini-gold)]"
								/>
								<h2 className="text-2xl font-extrabold text-primary">
									Les has trobades totes!
								</h2>
								<p className="mt-2">Demà t'esperen cinc paraules noves.</p>
								<Button asChild className="mt-5">
									<Link to="/mini/dies-anteriors">Veure el meu progrés</Link>
								</Button>
							</div>
						) : (
							<>
								<p
									className="text-center text-sm text-muted-foreground lg:min-h-10"
									role="status"
								>
									{message}
								</p>
								<fieldset
									disabled={!ready || busy || expired}
									aria-label="Forma una paraula"
								>
									<PuzzleControls
										mini
										inline
										aiClueMode={false}
										layout="grid"
										canUseHint={canUseHint}
										currentGuess={guess}
										hintsUsed={progress.hintsUsed}
										isComplete={complete}
										shuffledLetters={progress.shuffledLetters}
										onBackspace={() =>
											setGuess((current) => current.slice(0, -1))
										}
										onHint={hint}
										onLetterClick={appendLetter}
										onShuffle={shuffle}
										onSubmitGuess={() => void submit()}
										submitFeedback={null}
										runClickAction={(event, action) => {
											action();
											if (event.detail > 0) event.currentTarget.blur();
										}}
										runPressAction={() => {}}
									/>
								</fieldset>
								<p className="text-center text-xs text-muted-foreground max-lg:[@media(max-height:700px)]:hidden">
									{!canUseHint && ready
										? "Ja pots veure totes les lletres. Escriu les paraules per completar el joc!"
										: "Pots repetir les lletres i demanar tantes pistes com vulguis."}
								</p>
							</>
						)}
					</div>
				</div>
			</div>
			<section
				className="border-t border-border/60 pt-2 pb-[calc(var(--mini-panel-h)_+_1rem)] lg:mt-5 lg:pt-4 lg:pb-0"
				aria-label="Les cinc paraules"
			>
				<div className="flex flex-wrap justify-center gap-2">
					{puzzle.wordSlots.map((slot) => {
						const found = visibleProgress.guessedWordIds.includes(slot.id);
						return (
							<button
								type="button"
								key={slot.id}
								onClick={() => {
									setLocateId(slot.id);
									boardRef.current?.scrollIntoView({
										behavior: "smooth",
										block: "start",
									});
								}}
								className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 font-bold tracking-widest focus-visible:outline-2 focus-visible:outline-ring ${found ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
								aria-label={`${getDisplayedSlotWord(slot, cellLetters)}, ${found ? "trobada" : `${slot.length} lletres`}. Mostra al tauler.`}
							>
								{getDisplayedSlotWord(slot, cellLetters)}
								{found ? <Check className="size-4" aria-hidden /> : null}
							</button>
						);
					})}
				</div>
			</section>
		</div>
	);
}
