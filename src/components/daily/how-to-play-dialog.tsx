import { ArrowDown, ArrowRight, Check } from "lucide-react";
import { Dialog } from "radix-ui";
import {
	type KeyboardEvent,
	useEffect,
	useReducer,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_LETTER_LAYOUT } from "@/lib/anon-identity";
import { markHowToPlaySeen, markWelcomeSeen } from "@/lib/puzzle-local";
import { shuffleArray } from "@/lib/shuffle";
import { DailyControls, type TutorialControlTarget } from "./daily-controls";
import { DailyGrid } from "./daily-grid";
import { getGuessKeyboardAction, getSlotCellKey } from "./daily-helpers";
import { DailyWordList } from "./daily-word-list";
import {
	getTutorialStep,
	INITIAL_TUTORIAL_STATE,
	TUTORIAL_BOARD,
	TUTORIAL_LETTERS,
	TUTORIAL_WORDS,
	tutorialReducer,
} from "./tutorial-puzzle";

type HowToPlayDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function HowToPlayDialog({ open, onOpenChange }: HowToPlayDialogProps) {
	function finishTutorial() {
		markHowToPlaySeen();
		markWelcomeSeen();
		onOpenChange(false);
	}

	return (
		<Dialog.Root
			open={open}
			onOpenChange={(next) => (next ? onOpenChange(true) : finishTutorial())}
		>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 bg-background" />
				<Dialog.Content
					className="fixed inset-0 z-50 overflow-hidden bg-background text-foreground outline-none"
					onEscapeKeyDown={(event) => event.preventDefault()}
					onOpenAutoFocus={(event) => {
						event.preventDefault();
					}}
				>
					<TutorialPuzzle onFinish={finishTutorial} />
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

function TutorialPuzzle({ onFinish }: { onFinish: () => void }) {
	const rootRef = useRef<HTMLDivElement>(null);
	const scrollRef = useRef<HTMLElement>(null);
	const wordListRef = useRef<HTMLElement>(null);
	useEffect(() => {
		rootRef.current?.focus({ preventScroll: true });
	}, []);
	const [state, dispatch] = useReducer(tutorialReducer, INITIAL_TUTORIAL_STATE);
	const [letters, setLetters] = useState(TUTORIAL_LETTERS);
	const [locatedWordId, setLocatedWordId] = useState<number | null>(null);
	const step = getTutorialStep(state);
	useEffect(() => {
		if (step === "complete" && scrollRef.current)
			scrollRef.current.scrollTop = 0;
	}, [step]);
	const nextLetter = "casa"[state.guess.length] ?? "c";
	const stepNumber =
		step === "spell" || step === "submit" ? 1 : step === "clue" ? 2 : 3;
	const target: TutorialControlTarget | undefined =
		step === "spell"
			? { kind: "letter", letter: nextLetter }
			: step === "submit"
				? { kind: "submit" }
				: step === "clue"
					? { kind: "hint" }
					: undefined;
	const revealedAnswers: Record<number, string> = {};
	const clueTextsByWordId: Record<number, string> = {};
	const cellLetters = new Map<string, string>();
	for (const word of TUTORIAL_WORDS) {
		if (state.clueWordIds.includes(word.id))
			clueTextsByWordId[word.id] = word.clue;
		if (!state.foundWordIds.includes(word.id)) continue;
		revealedAnswers[word.id] = word.answer;
		[...word.answer].forEach((letter, index) => {
			cellLetters.set(getSlotCellKey(word, index), letter);
		});
	}
	const activeClues = TUTORIAL_WORDS.filter(
		(word) =>
			state.clueWordIds.includes(word.id) &&
			!state.foundWordIds.includes(word.id),
	);
	const activeClue = activeClues.at(-1);
	const locatedWord =
		step === "spell" || step === "submit"
			? TUTORIAL_WORDS[0]
			: (TUTORIAL_WORDS.find((word) => word.id === locatedWordId) ??
				activeClue);
	const locateCells = new Set(
		locatedWord
			? [...locatedWord.answer].map((_, index) =>
					getSlotCellKey(locatedWord, index),
				)
			: [],
	);
	const canUseHint =
		(step === "clue" || step === "finish") &&
		state.clueWordIds.length < 3 &&
		TUTORIAL_WORDS.some(
			(word) =>
				!state.foundWordIds.includes(word.id) &&
				!state.clueWordIds.includes(word.id),
		);

	function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		// Keep practice keystrokes away from the live puzzle underneath.
		event.stopPropagation();
		if (
			event.metaKey ||
			event.ctrlKey ||
			event.altKey ||
			event.defaultPrevented
		)
			return;
		const action = getGuessKeyboardAction(event.key, letters, event.code);
		if (!action) return;
		if (
			action.type === "submit" &&
			event.target instanceof HTMLElement &&
			event.target.closest("button") &&
			(!event.target.closest('[data-slot="letter-key"]') ||
				state.guess.length < 4)
		)
			return;
		event.preventDefault();
		if (action.type === "append_letter") {
			rootRef.current?.focus({ preventScroll: true });
			dispatch({ type: "letter", letter: action.letter });
		} else if (!event.repeat || action.type === "backspace")
			dispatch({ type: action.type });
	}

	const title =
		step === "complete"
			? "Ja saps jugar a Garbuix!"
			: step === "clue"
				? "Una pista per continuar"
				: step === "finish"
					? "Ara, acaba el teu primer garbuix"
					: "Comencem amb CASA";
	const instruction =
		step === "spell"
			? `Toca la ${nextLetter.toUpperCase()}${state.guess.length === 3 ? " una altra vegada. Pots repetir les lletres!" : " per formar CASA. També pots fer servir el teclat."}`
			: step === "submit"
				? "Ja la tens! Toca la fletxa per comprovar-la o prem Enter."
				: step === "clue"
					? "CASA ja és a la quadrícula. Mantén premut el botó Pista per descobrir una altra paraula."
					: step === "finish"
						? `Troba ${TUTORIAL_WORDS.length - state.foundWordIds.length === 1 ? "la paraula que falta" : `les ${TUTORIAL_WORDS.length - state.foundWordIds.length} paraules que falten`} amb les mateixes lletres. Les lletres que es creuen i les pistes t'ajudaran.`
						: "Has trobat les 5 paraules. El repte d'avui t'espera!";

	return (
		<div
			ref={rootRef}
			role="application"
			aria-label="Tauler del tutorial"
			tabIndex={-1}
			className="tutorial-puzzle flex h-full flex-col outline-none"
			onKeyDown={handleKeyDown}
		>
			<div className="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-3 border-b border-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8">
				<span className="text-lg font-bold text-primary">
					Garbuix!{" "}
					<span className="ml-2 text-xs font-medium text-muted-foreground font-ui">
						Tutorial
					</span>
				</span>
				<Button
					variant="ghost"
					onClick={onFinish}
					className="text-muted-foreground"
				>
					Saltar el tutorial <ArrowRight className="size-4" />
				</Button>
			</div>
			<div
				className={`mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col lg:px-8 lg:pb-6 ${step !== "complete" ? "lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6" : ""}`}
			>
				<section
					ref={scrollRef}
					className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-8 lg:px-0"
					aria-label="Quadrícula i paraules del tutorial"
				>
					<div className="flex h-full min-h-72 flex-col gap-3 py-3 sm:py-4">
						<div className="flex shrink-0 items-center justify-between text-xs font-semibold font-ui">
							<span className="uppercase tracking-wider text-muted-foreground">
								El teu primer garbuix
							</span>
							<span className="text-primary" aria-live="polite">
								{state.foundWordIds.length} / 5 paraules
							</span>
						</div>
						<div className="flex min-h-0 flex-1 flex-col">
							<DailyGrid
								fitHeight
								puzzle={TUTORIAL_BOARD}
								revealedCells={new Set(cellLetters.keys())}
								cellLetters={cellLetters}
								highlightedWordId={null}
								locateCells={locateCells}
							/>
						</div>
						<div
							className="shrink-0 space-y-2"
							aria-live="polite"
							aria-atomic="true"
						>
							<div className="flex items-center gap-2 text-xs font-semibold text-primary font-ui">
								{step === "complete" ? (
									<Check className="size-4" />
								) : (
									<span>Pas {stepNumber} de 3</span>
								)}
								<div className="flex gap-1" aria-hidden>
									{[1, 2, 3].map((number) => (
										<span
											key={number}
											className={`h-1 w-6 rounded-full ${number <= stepNumber ? "bg-primary" : "bg-muted"}`}
										/>
									))}
								</div>
							</div>
							<Dialog.Title className="text-xl font-bold tracking-tight sm:text-2xl">
								{title}
							</Dialog.Title>
							<Dialog.Description className="text-sm leading-snug text-muted-foreground font-ui">
								{instruction}
							</Dialog.Description>
						</div>
						{step === "complete" ? (
							<Button size="lg" onClick={onFinish}>
								Jugar al repte d'avui <ArrowRight className="size-4" />
							</Button>
						) : null}
						<Button
							variant="ghost"
							size="sm"
							className="shrink-0 gap-2 self-center text-muted-foreground font-ui"
							onClick={() =>
								wordListRef.current?.scrollIntoView({
									behavior: "smooth",
									block: "start",
								})
							}
						>
							<ArrowDown className="size-4" />
							{activeClue
								? "Baixa per llegir la pista"
								: "Baixa per veure la llista de paraules"}
						</Button>
					</div>
					<section
						ref={wordListRef}
						aria-label="Paraules del tutorial"
						className="scroll-mt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4"
					>
						<h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider font-ui">
							Paraules ({state.foundWordIds.length}/5)
						</h3>
						<DailyWordList
							puzzle={TUTORIAL_BOARD}
							idPrefix="tutorial-"
							guessedWordIds={state.foundWordIds}
							revealedAnswers={revealedAnswers}
							cellLetters={cellLetters}
							clueWordIds={state.clueWordIds}
							clueTextsByWordId={clueTextsByWordId}
							foundClueTextsByWordId={clueTextsByWordId}
							onWordTap={(wordId) => {
								setLocatedWordId(wordId);
								scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
							}}
						/>
						<p className="mt-4 text-center text-xs text-muted-foreground font-ui">
							Partida de pràctica. El teu progrés d'avui comença després.
						</p>
					</section>
				</section>
				{step !== "complete" ? (
					<div className="z-10 shrink-0 rounded-t-2xl border-t border-border/60 bg-background px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgb(0,0,0,0.06)] dark:shadow-[0_-2px_12px_rgb(0,0,0,0.25)] lg:self-center lg:rounded-2xl lg:border lg:p-4">
						<DailyControls
							inline
							aiClueMode
							layout={DEFAULT_LETTER_LAYOUT}
							tutorialTarget={target}
							canUseHint={canUseHint}
							currentGuess={state.guess}
							hintsUsed={state.clueWordIds.length}
							isComplete={false}
							shuffledLetters={letters}
							onBackspace={() => dispatch({ type: "backspace" })}
							onHint={() => {
								setLocatedWordId(null);
								dispatch({ type: "clue" });
							}}
							onLetterClick={(letter) => dispatch({ type: "letter", letter })}
							onShuffle={() => setLetters(shuffleArray(letters))}
							onSubmitGuess={() => dispatch({ type: "submit" })}
							submitFeedback={null}
							runClickAction={(_event, action) => action()}
							runPressAction={() => {}}
						/>
						<p
							role="status"
							className="min-h-5 px-2 pb-1 text-center text-xs text-primary font-ui"
						>
							{state.message}
						</p>
					</div>
				) : null}
			</div>
		</div>
	);
}
