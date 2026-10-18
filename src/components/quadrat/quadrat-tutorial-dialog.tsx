import { ArrowRight, Check } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { DailyWordsMeter } from "@/components/daily/daily-status";
import { HELD_FOUND_WORD_MS } from "@/components/puzzle/puzzle-animation-timing";
import { PuzzleGuessDisplay } from "@/components/puzzle/puzzle-guess-display";
import { useIsDesktopLayout } from "@/components/puzzle/use-is-desktop-layout";
import { useSubmitFeedback } from "@/components/puzzle/use-submit-feedback";
import { Button } from "@/components/ui/button";
import { getWordFromPath } from "@/lib/quadrat-board";
import { markQuadratTutorialSeen } from "@/lib/quadrat-local";
import { QUADRAT_WORD_COUNT } from "@/lib/quadrat-types";
import { QuadratBoard } from "./quadrat-board";
import {
	getQuadratTutorialStep,
	getTutorialBoardState,
	INITIAL_QUADRAT_TUTORIAL_STATE,
	type QuadratTutorialStep,
	releaseTutorialPath,
	TUTORIAL_BOARD,
	TUTORIAL_GUIDED_WORD,
	TUTORIAL_LETTERS,
	TUTORIAL_WORDS,
} from "./quadrat-tutorial-puzzle";
import { QuadratWordList } from "./quadrat-word-list";
import { QuadratWordSheet } from "./quadrat-word-sheet";
import { useFlashPath } from "./use-flash-path";

const TUTORIAL_SLOTS = TUTORIAL_WORDS.map(({ id, answer }) => ({
	id,
	length: answer.length,
}));

const STEPS: QuadratTutorialStep[] = ["drag", "follow", "complete"];
const STEP_COPY: Record<
	QuadratTutorialStep,
	{ title: string; instruction: string }
> = {
	drag: {
		title: "Arrossega per formar PORTA",
		instruction:
			"Posa el dit a la P i arrossega'l per la O, la R i la T fins a la A. Quan l'aixequis, es comprova la paraula.",
	},
	follow: {
		title: "Els números baixen",
		instruction:
			"El número de cada lletra diu quantes paraules hi passen encara. Amb PORTA, la T i la A han baixat de 2 a 1, i la P, la O i la R s'han apagat amb les seves línies. Segueix les que queden per trobar l'última paraula.",
	},
	complete: {
		title: "Ja saps jugar a Garbuix quadrat!",
		instruction: `Cada dia hi ha ${QUADRAT_WORD_COUNT} paraules amagades al quadrat. Quan te'n quedin poques, els números i les línies t'ensenyaran per on passen.`,
	},
};

const TITLE_CLASS = "text-lg font-bold leading-tight tracking-tight";
const INSTRUCTION_CLASS = "text-sm leading-snug text-muted-foreground font-ui";

type QuadratTutorialDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function QuadratTutorialDialog({
	open,
	onOpenChange,
}: QuadratTutorialDialogProps) {
	function finishTutorial() {
		markQuadratTutorialSeen();
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
					onOpenAutoFocus={(event) => event.preventDefault()}
				>
					<QuadratTutorial onFinish={finishTutorial} />
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

function QuadratTutorial({ onFinish }: { onFinish: () => void }) {
	const [state, setState] = useState(INITIAL_QUADRAT_TUTORIAL_STATE);
	const [path, setPath] = useState<number[]>([]);
	const { flashPath, flashFoundPath, clearFlashPath } = useFlashPath();
	const { submitFeedback, showSubmitFeedback, clearSubmitFeedback } =
		useSubmitFeedback({ newWordDurationMs: HELD_FOUND_WORD_MS });
	const isDesktop = useIsDesktopLayout();
	const step = getQuadratTutorialStep(state);
	// The last word lights up before the board settles into its finished look.
	const finished = step === "complete" && flashPath === null;
	const shownStep: QuadratTutorialStep =
		step === "complete" && !finished ? "follow" : step;
	const stepNumber = shownStep === "drag" ? 1 : 2;
	const foundCount = state.foundWordIds.length;
	const answers = Object.fromEntries(
		TUTORIAL_WORDS.filter(({ id }) => state.foundWordIds.includes(id)).map(
			({ id, answer }) => [id, answer],
		),
	);

	function handlePathChange(next: number[]) {
		clearSubmitFeedback();
		clearFlashPath();
		setPath(next);
	}

	function handleRelease(released: number[]) {
		setPath([]);
		const result = releaseTutorialPath(state, released);
		setState(result.state);
		if (result.feedback)
			showSubmitFeedback(result.feedback.word, result.feedback.kind);
		if (result.foundPath) flashFoundPath(result.foundPath);
	}

	const wordList = (
		<QuadratWordList
			wordSlots={TUTORIAL_SLOTS}
			guessedWordIds={state.foundWordIds}
			answers={answers}
			clueWordIds={[]}
			clueTexts={{}}
		/>
	);

	return (
		<div className="flex h-full flex-col">
			<div className="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-4 sm:pb-1.5 sm:pt-[calc(env(safe-area-inset-top)+1rem)]">
				{/* The game's name is longer than the daily one, so on a phone the
				    badge goes and the skip button shortens to keep it on one line. */}
				<span className="flex items-center gap-3 whitespace-nowrap">
					<span className="text-2xl font-bold text-primary">
						Garbuix{" "}
						<span className="text-[var(--quadrat-accent)]">quadrat</span>
					</span>
					<span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary font-ui sm:inline">
						Tutorial
					</span>
				</span>
				<Button
					variant="ghost"
					onClick={onFinish}
					aria-label="Saltar el tutorial"
					className="-mr-2 text-muted-foreground"
				>
					<span>
						Saltar<span className="hidden sm:inline"> el tutorial</span>
					</span>
					<ArrowRight className="size-4" />
				</Button>
			</div>
			{/* The daily board's layout, with the step card where the player reads
			    it before dragging: above the board on a phone, beside it on a
			    desktop. */}
			<div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-3 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:grid lg:grid-cols-2 lg:grid-rows-[auto_auto_minmax(0,1fr)] lg:gap-x-10 lg:gap-y-6 lg:px-6 lg:pt-6 lg:pb-6">
				<div className="shrink-0 overflow-hidden rounded-lg lg:col-span-2">
					<DailyWordsMeter
						foundCount={foundCount}
						totalWords={TUTORIAL_WORDS.length}
						guessCount={state.guessCount}
					/>
				</div>
				<div className="shrink-0 space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3 lg:col-start-2 lg:row-start-2 lg:p-4">
					<div className="flex items-center gap-2 text-xs font-semibold text-primary font-ui">
						{finished ? (
							<Check className="size-4" />
						) : (
							<span>Pas {stepNumber} de 2</span>
						)}
						<div className="flex gap-1" aria-hidden>
							{[1, 2].map((number) => (
								<span
									key={number}
									className={`h-1 w-5 rounded-full ${number <= stepNumber ? "bg-primary" : "bg-primary/15"}`}
								/>
							))}
						</div>
						{/* Up here the list costs the board no height on a phone. */}
						{isDesktop ? null : (
							<QuadratWordSheet
								foundCount={foundCount}
								totalWords={TUTORIAL_WORDS.length}
								triggerClassName="-my-1.5 -mr-2 ml-auto h-7 gap-1.5 px-2 text-xs sm:h-7"
							>
								{wordList}
							</QuadratWordSheet>
						)}
					</div>
					{/* Every step's text takes its room at once, so on a short phone
					    the board keeps its size when the longer second step comes in. */}
					<div className="grid" aria-live="polite" aria-atomic="true">
						{STEPS.map((candidate) => {
							const { title, instruction } = STEP_COPY[candidate];
							return candidate === shownStep ? (
								<div key={candidate} className="space-y-1.5 [grid-area:1/1]">
									<Dialog.Title className={TITLE_CLASS}>{title}</Dialog.Title>
									<Dialog.Description className={INSTRUCTION_CLASS}>
										{instruction}
									</Dialog.Description>
								</div>
							) : (
								<div
									key={candidate}
									className="invisible space-y-1.5 [grid-area:1/1]"
								>
									<p className={TITLE_CLASS}>{title}</p>
									<p className={INSTRUCTION_CLASS}>{instruction}</p>
								</div>
							);
						})}
					</div>
					{finished ? (
						<Button size="lg" className="mt-2 w-full" onClick={onFinish}>
							Jugar al quadrat d'avui <ArrowRight className="size-4" />
						</Button>
					) : (
						// Reserves its line so a message never resizes the board.
						<p
							role="status"
							className="min-h-4 text-xs font-semibold leading-4 text-primary font-ui"
						>
							{state.message}
						</p>
					)}
				</div>
				{isDesktop ? (
					<section
						aria-label="Paraules del tutorial"
						className="min-h-0 overflow-y-auto lg:col-start-2 lg:row-start-3"
					>
						<h3 className="mb-3 text-xl font-extrabold tracking-tight">
							Paraules
						</h3>
						{wordList}
					</section>
				) : null}
				<div className="flex min-h-0 flex-1 flex-col items-center gap-6 lg:col-start-1 lg:row-span-2 lg:row-start-2 lg:gap-8">
					<div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-6 px-4 [container-type:size] lg:flex-none lg:gap-8 lg:px-0 lg:[container-type:normal]">
						{finished ? null : (
							<PuzzleGuessDisplay
								currentGuess={getWordFromPath(
									TUTORIAL_LETTERS,
									path,
								).toUpperCase()}
								submitFeedback={submitFeedback}
								quadrat
							/>
						)}
						<div className="w-[min(100cqw,calc(100cqh-4.5rem),28rem)] lg:w-full lg:max-w-[min(24rem,48svh)]">
							<QuadratBoard
								letters={TUTORIAL_LETTERS}
								connections={TUTORIAL_BOARD.connections}
								board={getTutorialBoardState(state)}
								path={path}
								interactive={step !== "complete"}
								complete={finished}
								clueStarts={[]}
								flashPath={flashPath}
								guidePath={
									step === "drag" ? TUTORIAL_GUIDED_WORD.path : undefined
								}
								onPathChange={handlePathChange}
								onRelease={handleRelease}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
