import { Star } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { CompletedPuzzleWordList } from "@/components/daily/completion-word-list";
import { PuzzleCompletionBanner } from "@/components/puzzle/puzzle-completion-banner";
import { PuzzleConfetti } from "@/components/puzzle/puzzle-confetti";
import { PuzzleControls } from "@/components/puzzle/puzzle-controls";
import { PuzzleGrid } from "@/components/puzzle/puzzle-grid";
import { PuzzleLoadingPage } from "@/components/puzzle/puzzle-loading";
import { SimpleWordList } from "@/components/puzzle/simple-word-list";
import { useDailyRollover } from "@/components/puzzle/use-daily-rollover";
import { useDecodedProgress } from "@/components/puzzle/use-decoded-progress";
import { usePuzzleAnimations } from "@/components/puzzle/use-puzzle-animations";
import { useSyllableProgress } from "@/components/syllables/use-syllable-progress";
import { Button } from "@/components/ui/button";
import { createPuzzleEvent } from "@/lib/puzzle-client";
import {
	buildCellLetters,
	buildRevealedCells,
	getRandomHintCellKey,
} from "@/lib/puzzle-helpers";
import { formatGuess } from "@/lib/puzzle-text";
import { shuffleArray } from "@/lib/shuffle";
import { resolveSyllableGuess } from "@/lib/syllable-client";
import { getSyllablePageData } from "@/lib/syllable-server-fns";

export type SyllablePageData = Awaited<ReturnType<typeof getSyllablePageData>>;

export function Syllable({ initialData }: { initialData: SyllablePageData }) {
	const [data, setData] = useState(initialData);
	const refresh = useCallback(async () => {
		setData(await getSyllablePageData());
	}, []);
	const expired = useDailyRollover(data.rolloverAt, refresh);
	return (
		<SyllableGame
			key={`${data.puzzle.id}:${data.userId}`}
			data={data}
			expired={expired}
		/>
	);
}

function SyllableGame({
	data,
	expired,
}: {
	data: SyllablePageData;
	expired: boolean;
}) {
	const { puzzle, userId } = data;
	const { progress, ready, dispatch, syncFailed } = useSyllableProgress({
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
	const [guess, setGuess] = useState<string[]>([]);
	const {
		gridRef,
		gridEffects,
		submitFeedback,
		showSubmitFeedback,
		clearSubmitFeedback,
		handleLocateWord,
	} = usePuzzleAnimations(puzzle);
	const [celebrate, setCelebrate] = useState(false);
	const [busy, setBusy] = useState(false);
	const submitting = useRef(false);
	const snapshot = decoded.snapshot;
	const isPresentable = snapshot !== null;
	const visibleProgress = snapshot?.progress ?? progress;
	const complete = visibleProgress.completedAt !== null;
	// Keep the board still and the feedback visible until the last answer has been decoded.
	const displayComplete =
		complete && submitFeedback === null && gridEffects.animatingWordId === null;
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
	const appendSyllable = useCallback(
		(letter: string) => {
			clearSubmitFeedback();
			setGuess((current) =>
				current.join("").length + letter.length <= 12
					? [...current, letter]
					: current,
			);
		},
		[clearSubmitFeedback],
	);
	const backspace = useCallback(() => {
		clearSubmitFeedback();
		setGuess((current) => current.slice(0, -1));
	}, [clearSubmitFeedback]);
	const submit = useCallback(async () => {
		if (
			!isPresentable ||
			expired ||
			progress.completedAt ||
			guess.length === 0 ||
			submitting.current
		)
			return;
		submitting.current = true;
		setBusy(true);
		try {
			const result = await resolveSyllableGuess({
				puzzle,
				progress,
				syllables: guess,
			});
			showSubmitFeedback(formatGuess(guess.join("")), result.kind);
			dispatch(
				createPuzzleEvent("guess_added", {
					guessHash: result.guessHash,
					matchedWordId: result.matchedSlotId,
					unlockToken: result.unlockToken,
					validNotInPuzzle: result.kind === "valid_but_not_in_puzzle",
				}),
			);
			setGuess([]);
			if (result.kind === "new_word") {
				if (progress.guessedWordIds.length + 1 === puzzle.wordSlots.length) {
					setCelebrate(true);
				}
			}
		} catch {
			toast.error("No s'ha pogut comprovar la paraula. Torna-ho a provar.");
		} finally {
			submitting.current = false;
			setBusy(false);
		}
	}, [
		dispatch,
		expired,
		guess,
		isPresentable,
		progress,
		puzzle,
		showSubmitFeedback,
	]);

	const hint = () => {
		if (!canUseHint || expired || busy) return;
		const cellKey = getRandomHintCellKey(puzzle, revealedCells);
		if (!cellKey) return;
		dispatch(createPuzzleEvent("hint_used", { cellKey }));
	};

	const shuffle = () => {
		if (!ready || complete || expired || busy) return;
		dispatch(
			createPuzzleEvent("letters_shuffled", {
				shuffledLetters: shuffleArray(progress.shuffledLetters),
			}),
		);
	};

	if (!isPresentable) {
		return (
			<PuzzleLoadingPage
				synchronizing={Boolean(userId)}
				onRetry={decoded.hasError ? decoded.retry : undefined}
			/>
		);
	}

	const wordProgress = (
		<div
			className="flex shrink-0 justify-center gap-1"
			role="img"
			aria-label={`${visibleProgress.guessedWordIds.length} de 5 paraules trobades`}
		>
			{puzzle.wordSlots.map((slot, index) => (
				<Star
					key={slot.id}
					aria-hidden
					className={`size-5 sm:size-6 ${index < visibleProgress.guessedWordIds.length ? "fill-[var(--syllable-star)] text-[var(--syllable-star)]" : "text-border"}`}
				/>
			))}
		</div>
	);

	return (
		<div className="syllable-game mx-auto flex h-full max-w-4xl flex-col gap-2 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] lg:gap-4 lg:px-6 lg:pt-6 lg:pb-[calc(env(safe-area-inset-bottom)+1rem)]">
			<PuzzleConfetti fire={celebrate && displayComplete} />
			{displayComplete ? (
				<PuzzleCompletionBanner>{wordProgress}</PuzzleCompletionBanner>
			) : (
				wordProgress
			)}
			{expired ? (
				<p role="status">Estem preparant el nou Garbuix síl·labes...</p>
			) : null}
			{syncFailed ? (
				<p role="status" className="mb-2 text-sm text-muted-foreground">
					Progrés desat al navegador. Es sincronitzarà quan torni la connexió.
				</p>
			) : null}
			{decoded.hasError ? (
				<Button variant="outline" onClick={decoded.retry}>
					Torna a carregar les síl·labes
				</Button>
			) : null}
			<div className="flex min-h-0 flex-1 flex-col items-center gap-2 lg:gap-5">
				<div
					ref={gridRef}
					className="mx-auto flex min-h-0 w-full max-w-sm flex-1 lg:max-w-md"
				>
					<PuzzleGrid
						fitHeight
						puzzle={puzzle}
						revealedCells={new Set(cellLetters.keys())}
						cellLetters={cellLetters}
						{...gridEffects}
					/>
				</div>
				{!displayComplete ? (
					<div className="-mx-4 w-[calc(100%+2rem)] shrink-0 touch-none space-y-1 rounded-t-2xl border-t border-border/60 bg-background px-4 pt-2 lg:mx-0 lg:w-full lg:max-w-sm lg:touch-auto lg:space-y-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
						<fieldset
							disabled={!ready || busy || expired || complete}
							aria-label="Forma una paraula"
						>
							<PuzzleControls
								mini
								canSubmit={guess.length > 0}
								inline
								aiClueMode={false}
								layout="grid"
								canUseHint={canUseHint}
								currentGuess={guess
									.map((cell) => cell.toUpperCase())
									.join(" · ")}
								hintsUsed={progress.hintsUsed}
								isComplete={displayComplete}
								shuffledLetters={progress.shuffledLetters}
								onBackspace={backspace}
								onHint={hint}
								onLetterClick={appendSyllable}
								onShuffle={shuffle}
								onSubmitGuess={() => void submit()}
								submitFeedback={submitFeedback}
								runClickAction={(event, action) => {
									action();
									if (event.detail > 0) event.currentTarget.blur();
								}}
								runPressAction={() => {}}
							/>
						</fieldset>
					</div>
				) : null}
			</div>
			{displayComplete ? (
				<CompletedPuzzleWordList
					puzzle={puzzle}
					guessHashes={visibleProgress.guessHashes}
					revealedAnswers={snapshot.answers}
					displayWords={puzzle.displayWords}
				/>
			) : (
				<SimpleWordList
					wordSlots={puzzle.wordSlots}
					guessedWordIds={visibleProgress.guessedWordIds}
					cellLetters={cellLetters}
					onWordTap={handleLocateWord}
				/>
			)}
		</div>
	);
}
