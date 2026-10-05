import { ArrowDown, ArrowRight, Check } from "lucide-react";
import { Dialog } from "radix-ui";
import {
	type CSSProperties,
	type KeyboardEvent,
	useEffect,
	useReducer,
	useRef,
	useState,
} from "react";
import { Logo } from "@/components/logo";
import {
	KEYPAD_FALLBACK_HEIGHT,
	PuzzleControls,
	type TutorialControlTarget,
} from "@/components/puzzle/puzzle-controls";
import { PuzzleGrid } from "@/components/puzzle/puzzle-grid";
import { useLetterLayout } from "@/components/puzzle/use-letter-layout";
import { Button } from "@/components/ui/button";
import { validateClueText } from "@/lib/clue-fairness";
import type { ClueRequest } from "@/lib/clue-request-types";
import { getGuessKeyboardAction, getSlotCellKey } from "@/lib/puzzle-helpers";
import { markHowToPlaySeen, markWelcomeSeen } from "@/lib/puzzle-local";
import { WORDS_PER_BONUS_CLUE } from "@/lib/puzzle-types";
import { shuffleArray } from "@/lib/shuffle";
import { DailyWordsMeter } from "./daily-status";
import { DailyWordList } from "./daily-word-list";
import {
	getTutorialStep,
	INITIAL_TUTORIAL_STATE,
	TUTORIAL_BOARD,
	TUTORIAL_LETTERS,
	TUTORIAL_WORDS,
	tutorialReducer,
} from "./tutorial-puzzle";

const TUTORIAL_HELP_WORD = TUTORIAL_WORDS[1];
const TUTORIAL_HELP_REQUEST: ClueRequest = {
	id: "tutorial-help",
	dateKey: "tutorial",
	puzzleId: "tutorial",
	wordId: TUTORIAL_HELP_WORD.id,
	wordLength: TUTORIAL_HELP_WORD.answer.length,
	requesterId: "tutorial-marta",
	requesterName: "la Marta",
	createdAt: "",
	requesterHasAiClue: false,
};

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
	const scrollRef = useRef<HTMLDivElement>(null);
	const wordListRef = useRef<HTMLElement>(null);
	useEffect(() => {
		rootRef.current?.focus({ preventScroll: true });
	}, []);
	const [state, dispatch] = useReducer(tutorialReducer, INITIAL_TUTORIAL_STATE);
	const [letters, setLetters] = useState(TUTORIAL_LETTERS);
	const [locatedWordId, setLocatedWordId] = useState<number | null>(null);
	const letterLayout = useLetterLayout();
	// Height of the keypad pinned to the bottom of a phone, which the board
	// above it is sized against. See the daily board.
	const [keypadHeight, setKeypadHeight] = useState<number | null>(null);
	const step = getTutorialStep(state);
	useEffect(() => {
		if (step === "help" || step === "complete") {
			if (scrollRef.current) scrollRef.current.scrollTop = 0;
			rootRef.current?.focus({ preventScroll: true });
		}
	}, [step]);
	const nextLetter = "casa"[state.guess.length] ?? "c";
	const stepNumber =
		step === "spell" || step === "submit"
			? 1
			: step === "clue"
				? 2
				: step === "finish"
					? 3
					: 4;
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
			event.defaultPrevented ||
			(event.target instanceof HTMLElement &&
				(event.target.isContentEditable ||
					event.target.closest("input, textarea, select")))
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
			: step === "help"
				? "Ajuda altres jugadors"
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
						: step === "help"
							? "Quan algú necessita una paraula que ja has trobat, pots ajudar-lo. Toca Ajuda la Marta: pots fer servir la definició o la pista que ja tens, o escriure qualsevol cosa que la pugui ajudar, sense dir la resposta."
							: "Has trobat les 5 paraules i has practicat com ajudar algú. El repte d'avui t'espera!";

	const isPlaying = step !== "help" && step !== "complete";
	const keypadHeightCss = !isPlaying
		? "0px"
		: keypadHeight == null
			? KEYPAD_FALLBACK_HEIGHT
			: `${keypadHeight}px`;

	return (
		<div
			ref={rootRef}
			role="application"
			aria-label="Tauler del tutorial"
			tabIndex={-1}
			className="tutorial-puzzle flex h-full flex-col outline-none"
			onKeyDown={handleKeyDown}
		>
			<div className="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-4 sm:pb-1.5 sm:pt-[calc(env(safe-area-inset-top)+1rem)]">
				<span className="flex items-center gap-3">
					<Logo className="h-5 w-5 text-primary sm:h-6 sm:w-6" aria-hidden />
					<span className="text-2xl font-bold text-primary">Garbuix!</span>
					<span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary font-ui">
						Tutorial
					</span>
				</span>
				<Button
					variant="ghost"
					onClick={onFinish}
					className="-mr-2 text-muted-foreground"
				>
					Saltar el tutorial <ArrowRight className="size-4" />
				</Button>
			</div>
			{/* Mirrors the daily board: on a phone the meter, the board and the step
			    card share the room above the keypad pinned to the bottom, with the
			    word list below the fold. On a desktop the step card takes the word
			    list's place under the keypad and the list follows it. */}
			<div
				ref={scrollRef}
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
				style={{ "--tutorial-keypad-h": keypadHeightCss } as CSSProperties}
			>
				<div className="h-full px-3 pt-2 sm:px-4 sm:pt-3 lg:flex lg:min-h-0 lg:flex-col lg:px-8 lg:pt-4 lg:pb-8">
					<div className="mx-auto h-full w-full max-w-4xl lg:grid lg:h-auto lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_20rem] lg:grid-rows-[auto_auto_auto_minmax(0,1fr)] lg:gap-x-8">
						<div
							className={`flex flex-col lg:contents ${isPlaying ? "h-[calc(100%_-_var(--tutorial-keypad-h))]" : ""}`}
						>
							<div
								className="mb-4 shrink-0 overflow-hidden rounded-lg sm:mb-6 lg:col-span-2 lg:row-start-1"
								aria-live="polite"
							>
								<DailyWordsMeter
									foundCount={state.foundWordIds.length}
									totalWords={TUTORIAL_WORDS.length}
									guessCount={state.guessCount}
								/>
							</div>
							{/* A phone needs the room for the help and closing steps, so the
							    finished board only stays on a desktop. */}
							<div
								className={`min-h-0 flex-1 flex-col pb-3 lg:col-start-1 lg:row-span-3 lg:row-start-2 lg:flex lg:pb-8 ${isPlaying ? "flex" : "hidden"}`}
							>
								<div className="mx-auto flex min-h-0 w-full flex-1 flex-col lg:max-w-sm">
									<PuzzleGrid
										fitHeight
										puzzle={TUTORIAL_BOARD}
										revealedCells={new Set(cellLetters.keys())}
										cellLetters={cellLetters}
										highlightedWordId={null}
										locateCells={locateCells}
									/>
								</div>
							</div>
							<div className="mb-3 shrink-0 space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3 lg:col-start-2 lg:row-start-3 lg:mt-6 lg:mb-0 lg:p-4">
								<div
									className="space-y-1.5"
									aria-live="polite"
									aria-atomic="true"
								>
									<div className="flex items-center gap-2 text-xs font-semibold text-primary font-ui">
										{step === "complete" ? (
											<Check className="size-4" />
										) : (
											<span>Pas {stepNumber} de 4</span>
										)}
										<div className="flex gap-1" aria-hidden>
											{[1, 2, 3, 4].map((number) => (
												<span
													key={number}
													className={`h-1 w-5 rounded-full ${number <= stepNumber ? "bg-primary" : "bg-primary/15"}`}
												/>
											))}
										</div>
										{activeClue ? (
											<Button
												variant="text"
												size="sm"
												className="ml-auto h-auto gap-1 p-0 text-xs text-primary lg:hidden"
												onClick={() =>
													wordListRef.current?.scrollIntoView({
														behavior: "smooth",
														block: "start",
													})
												}
											>
												Llegeix la pista <ArrowDown className="size-3.5" />
											</Button>
										) : null}
									</div>
									<Dialog.Title className="text-lg font-bold leading-tight tracking-tight">
										{title}
									</Dialog.Title>
									<Dialog.Description className="text-sm leading-snug text-muted-foreground font-ui">
										{instruction}
									</Dialog.Description>
									{step === "complete" ? (
										<p className="text-sm leading-snug text-muted-foreground font-ui">
											Al repte diari, cada {WORDS_PER_BONUS_CLUE} paraules
											vàlides de fora del joc et revelen una lletra a l'atzar.
										</p>
									) : null}
								</div>
								{isPlaying ? (
									// Reserves its line so a message never resizes the board.
									<p
										role="status"
										className="min-h-4 text-xs font-semibold leading-4 text-primary font-ui"
									>
										{state.message}
									</p>
								) : null}
								{step === "complete" ? (
									<Button size="lg" className="mt-2 w-full" onClick={onFinish}>
										Jugar al repte d'avui <ArrowRight className="size-4" />
									</Button>
								) : null}
							</div>
						</div>
						{isPlaying ? (
							<div className="lg:col-start-2 lg:row-start-2">
								<PuzzleControls
									aiClueMode
									layout={letterLayout}
									tutorialTarget={target}
									canUseHint={canUseHint}
									currentGuess={state.guess}
									hintsUsed={state.clueWordIds.length}
									isComplete={false}
									onHeightChange={setKeypadHeight}
									shuffledLetters={letters}
									onBackspace={() => dispatch({ type: "backspace" })}
									onHint={() => {
										setLocatedWordId(null);
										dispatch({ type: "clue" });
									}}
									onLetterClick={(letter) =>
										dispatch({ type: "letter", letter })
									}
									onShuffle={() => setLetters(shuffleArray(letters))}
									onSubmitGuess={() => dispatch({ type: "submit" })}
									submitFeedback={state.feedback}
									runClickAction={(_event, action) => action()}
									runPressAction={() => {}}
								/>
							</div>
						) : null}
						{/* The keypad floats over the bottom of a phone, so the last rows
						    need room to clear it. */}
						<section
							ref={wordListRef}
							aria-label="Paraules del tutorial"
							className="mt-3 scroll-mt-4 pb-[calc(var(--tutorial-keypad-h)_+_max(1.5rem,env(safe-area-inset-bottom)))] lg:col-start-2 lg:row-start-4 lg:mt-6 lg:min-h-0 lg:overflow-y-auto lg:pb-0"
						>
							<DailyWordList
								puzzle={TUTORIAL_BOARD}
								idPrefix="tutorial-"
								guessedWordIds={state.foundWordIds}
								revealedAnswers={revealedAnswers}
								cellLetters={cellLetters}
								clueWordIds={state.clueWordIds}
								clueTextsByWordId={clueTextsByWordId}
								foundClueTextsByWordId={clueTextsByWordId}
								incomingRequests={
									step === "help" ? [TUTORIAL_HELP_REQUEST] : []
								}
								onRespondToClue={async (_requestId, text) => {
									const result = validateClueText(
										text,
										TUTORIAL_HELP_WORD.answer,
									);
									if (result.ok) dispatch({ type: "help_sent" });
									return result;
								}}
								onWordTap={(wordId) => {
									setLocatedWordId(wordId);
									scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
								}}
							/>
							<p className="mt-4 text-center text-xs text-muted-foreground font-ui">
								Partida de pràctica.{" "}
								{step === "help"
									? "La Marta és un exemple: aquesta pista no s’envia a ningú."
									: "El teu progrés d’avui comença després."}
							</p>
						</section>
					</div>
				</div>
			</div>
		</div>
	);
}
