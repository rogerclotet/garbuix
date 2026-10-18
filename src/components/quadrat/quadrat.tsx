import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DailyWordsMeter } from "@/components/daily/daily-status";
import { HELD_FOUND_WORD_MS } from "@/components/puzzle/puzzle-animation-timing";
import { PuzzleCompletionBanner } from "@/components/puzzle/puzzle-completion-banner";
import { PuzzleConfetti } from "@/components/puzzle/puzzle-confetti";
import { PuzzleGuessDisplay } from "@/components/puzzle/puzzle-guess-display";
import { PuzzleHintButton } from "@/components/puzzle/puzzle-hint-button";
import { PuzzleLoadingPage } from "@/components/puzzle/puzzle-loading";
import { useDailyRollover } from "@/components/puzzle/use-daily-rollover";
import { useIsDesktopLayout } from "@/components/puzzle/use-is-desktop-layout";
import { useSubmitFeedback } from "@/components/puzzle/use-submit-feedback";
import { Button } from "@/components/ui/button";
import { createPuzzleEvent } from "@/lib/puzzle-client";
import { formatGuess } from "@/lib/puzzle-text";
import { getRemainingBoard, getWordFromPath } from "@/lib/quadrat-board";
import { resolveQuadratGuess } from "@/lib/quadrat-client";
import { QUADRAT_CLUE_LIMIT } from "@/lib/quadrat-progress";
import { getQuadratClues, getQuadratPageData } from "@/lib/quadrat-server-fns";
import { QUADRAT_MIN_WORD_LENGTH } from "@/lib/quadrat-types";
import { useWordClues } from "@/lib/use-word-clues";
import { QuadratBoard } from "./quadrat-board";
import { QuadratExtraWords } from "./quadrat-extra-words";
import { QuadratWordList } from "./quadrat-word-list";
import { QuadratWordSheet } from "./quadrat-word-sheet";
import { useQuadratDecoded } from "./use-quadrat-decoded";
import { useQuadratProgress } from "./use-quadrat-progress";

const CLUE_TOAST_MS = 10_000;

export type QuadratPageData = Awaited<ReturnType<typeof getQuadratPageData>>;

export function Quadrat({ initialData }: { initialData: QuadratPageData }) {
	const [data, setData] = useState(initialData);
	const refresh = useCallback(async () => {
		setData(await getQuadratPageData());
	}, []);
	const expired = useDailyRollover(data.rolloverAt, refresh);
	return (
		<QuadratGame
			key={`${data.puzzle.id}:${data.userId}`}
			data={data}
			expired={expired}
		/>
	);
}

function QuadratGame({
	data,
	expired,
}: {
	data: QuadratPageData;
	expired: boolean;
}) {
	const { puzzle, userId } = data;
	const { progress, ready, dispatch, syncFailed, syncPending } =
		useQuadratProgress({ puzzle, initialProgress: data.progress, userId });
	const decoded = useQuadratDecoded({ puzzle, progress, enabled: ready });
	const frame = decoded.frame;
	const visibleProgress = frame?.progress ?? progress;
	const complete = visibleProgress.completedAt !== null;
	const [path, setPath] = useState<number[]>([]);
	const [flashPath, setFlashPath] = useState<number[] | null>(null);
	const [celebrate, setCelebrate] = useState(false);
	const [busy, setBusy] = useState(false);
	const submitting = useRef(false);
	const flashTimerRef = useRef<number | null>(null);
	// Clues the player just asked for, announced once their text arrives.
	const pendingClueToastsRef = useRef(new Set<number>());
	const { submitFeedback, showSubmitFeedback, clearSubmitFeedback } =
		useSubmitFeedback({ newWordDurationMs: HELD_FOUND_WORD_MS });
	const isDesktop = useIsDesktopLayout();

	useEffect(
		() => () => {
			if (flashTimerRef.current != null) {
				window.clearTimeout(flashTimerRef.current);
			}
		},
		[],
	);

	const board = useMemo(
		() => getRemainingBoard(puzzle, Object.values(frame?.paths ?? {})),
		[puzzle, frame],
	);
	const clueTexts = useWordClues({
		puzzleId: puzzle.id,
		userId,
		wordIds: [
			...visibleProgress.clueWordIds,
			...visibleProgress.guessedWordIds,
		],
		// The server serves an account's clue once it has the request.
		pendingEventCount: syncPending ? 1 : 0,
		fetchClues: getQuadratClues,
	});
	const clueStarts = useMemo(
		() =>
			Object.entries(frame?.clueStarts ?? {})
				.filter(([id]) => !visibleProgress.guessedWordIds.includes(Number(id)))
				.map(([, start]) => start),
		[frame, visibleProgress.guessedWordIds],
	);

	useEffect(() => {
		for (const wordId of [...pendingClueToastsRef.current]) {
			const clue = clueTexts[wordId];
			if (!clue) continue;
			toast("Pista", { description: clue, duration: CLUE_TOAST_MS });
			pendingClueToastsRef.current.delete(wordId);
		}
	}, [clueTexts]);

	// Keep the board still until the last word's feedback and flash are over.
	const displayComplete =
		complete && submitFeedback === null && flashPath === null;
	const interactive = ready && frame !== null && !busy && !complete && !expired;
	const clueCandidates = puzzle.wordSlots.filter(
		(slot) =>
			!visibleProgress.guessedWordIds.includes(slot.id) &&
			!visibleProgress.clueWordIds.includes(slot.id),
	);
	const canUseHint =
		interactive &&
		visibleProgress.clueWordIds.length < QUADRAT_CLUE_LIMIT &&
		clueCandidates.length > 0;

	const flashFoundPath = useCallback((found: number[]) => {
		if (flashTimerRef.current != null) {
			window.clearTimeout(flashTimerRef.current);
		}
		setFlashPath(found);
		flashTimerRef.current = window.setTimeout(() => {
			setFlashPath(null);
			flashTimerRef.current = null;
		}, HELD_FOUND_WORD_MS);
	}, []);

	const clearFlashPath = useCallback(() => {
		if (flashTimerRef.current != null) {
			window.clearTimeout(flashTimerRef.current);
			flashTimerRef.current = null;
		}
		setFlashPath(null);
	}, []);

	const handlePathChange = useCallback(
		(next: number[]) => {
			clearSubmitFeedback();
			clearFlashPath();
			setPath(next);
		},
		[clearFlashPath, clearSubmitFeedback],
	);

	const handleRelease = useCallback(
		async (released: number[]) => {
			setPath([]);
			// A tap on a single letter is not a guess.
			if (released.length < 2) return;
			const word = getWordFromPath(puzzle.letters, released);
			if (released.length < QUADRAT_MIN_WORD_LENGTH) {
				showSubmitFeedback(formatGuess(word), "invalid_input");
				return;
			}
			if (!interactive || submitting.current) return;
			submitting.current = true;
			setBusy(true);
			try {
				const result = await resolveQuadratGuess({
					puzzle,
					progress,
					path: released,
				});
				showSubmitFeedback(
					formatGuess(result.displayWord ?? word),
					result.kind,
				);
				dispatch(
					createPuzzleEvent("guess_added", {
						guessHash: result.guessHash,
						matchedWordId: result.matchedSlotId,
						unlockToken: result.unlockToken,
						validNotInPuzzle: result.kind === "valid_but_not_in_puzzle",
					}),
				);
				if (result.kind === "new_word") {
					flashFoundPath(released);
					if (progress.guessedWordIds.length + 1 === puzzle.wordSlots.length) {
						setCelebrate(true);
					}
				}
			} catch (error) {
				console.error("[quadrat] Could not check the guess", error);
				toast.error("No s'ha pogut comprovar la paraula. Torna-ho a provar.");
			} finally {
				submitting.current = false;
				setBusy(false);
			}
		},
		[
			dispatch,
			flashFoundPath,
			interactive,
			progress,
			puzzle,
			showSubmitFeedback,
		],
	);

	const handleHint = () => {
		if (!canUseHint) return;
		const choice =
			clueCandidates[Math.floor(Math.random() * clueCandidates.length)];
		if (!choice) return;
		dispatch(createPuzzleEvent("text_hint_requested", { wordId: choice.id }));
		pendingClueToastsRef.current.add(choice.id);
	};

	if (!frame) {
		return (
			<PuzzleLoadingPage
				synchronizing={Boolean(userId)}
				onRetry={decoded.hasError ? decoded.retry : undefined}
			/>
		);
	}

	const cluesLeft = QUADRAT_CLUE_LIMIT - visibleProgress.clueWordIds.length;
	const foundCount = visibleProgress.guessedWordIds.length;
	const totalWords = puzzle.wordSlots.length;
	const wordList = (
		<>
			<QuadratWordList
				wordSlots={puzzle.wordSlots}
				guessedWordIds={visibleProgress.guessedWordIds}
				answers={frame.answers}
				clueWordIds={visibleProgress.clueWordIds}
				clueTexts={clueTexts}
			/>
			{displayComplete ? (
				<QuadratExtraWords
					puzzle={puzzle}
					guessHashes={visibleProgress.guessHashes}
					revealedAnswers={frame.answers}
				/>
			) : null}
		</>
	);

	return (
		<div className="mx-auto flex h-full max-w-5xl flex-col gap-3 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:grid lg:grid-cols-2 lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-x-10 lg:gap-y-6 lg:px-6 lg:pt-6 lg:pb-6">
			<PuzzleConfetti fire={celebrate && displayComplete} />
			<div className="shrink-0 lg:col-span-2">
				{displayComplete ? (
					<PuzzleCompletionBanner>
						<p className="text-sm text-muted-foreground font-ui">
							{visibleProgress.guessCount} intents ·{" "}
							{visibleProgress.hintsUsed === 1
								? "1 pista"
								: `${visibleProgress.hintsUsed} pistes`}
						</p>
					</PuzzleCompletionBanner>
				) : (
					<div className="overflow-hidden rounded-lg">
						<DailyWordsMeter
							foundCount={foundCount}
							totalWords={totalWords}
							guessCount={visibleProgress.guessCount}
						/>
					</div>
				)}
				{expired ? (
					<p role="status" className="mt-2 text-sm text-muted-foreground">
						Estem preparant el nou Garbuix quadrat...
					</p>
				) : null}
				{syncFailed ? (
					<p role="status" className="mt-2 text-sm text-muted-foreground">
						Progrés desat al navegador. Es sincronitzarà quan torni la connexió.
					</p>
				) : null}
				{decoded.hasError ? (
					<Button variant="outline" onClick={decoded.retry} className="mt-2">
						Torna a carregar el tauler
					</Button>
				) : null}
			</div>
			{isDesktop ? (
				<section
					aria-label="Paraules del dia"
					className="min-h-0 overflow-y-auto lg:col-start-2 lg:row-start-2"
				>
					<h3 className="mb-3 text-xl font-extrabold tracking-tight">
						Paraules
					</h3>
					{wordList}
				</section>
			) : null}
			<div className="flex min-h-0 flex-1 flex-col items-center gap-6 lg:col-start-1 lg:row-start-2 lg:justify-center lg:gap-8">
				{/* On a phone the panel and the board fill whatever the column leaves
				    above the buttons: the board as wide as the screen allows and no
				    taller than the room under the panel. The side padding keeps a drag
				    that starts near the edge away from the system back gesture. */}
				<div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-6 px-4 [container-type:size] lg:flex-none lg:gap-8 lg:px-0 lg:[container-type:normal]">
					{displayComplete ? null : (
						<PuzzleGuessDisplay
							currentGuess={getWordFromPath(puzzle.letters, path).toUpperCase()}
							submitFeedback={submitFeedback}
							quadrat
						/>
					)}
					<div className="w-[min(100cqw,calc(100cqh-4.5rem),28rem)] lg:w-full lg:max-w-[min(24rem,48svh)]">
						<QuadratBoard
							letters={puzzle.letters}
							connections={puzzle.connections}
							board={board}
							path={path}
							interactive={interactive}
							complete={displayComplete}
							clueStarts={clueStarts}
							flashPath={flashPath}
							onPathChange={handlePathChange}
							onRelease={(released) => void handleRelease(released)}
						/>
					</div>
				</div>
				<div className="flex shrink-0 items-center justify-center gap-2">
					{displayComplete ? null : (
						<PuzzleHintButton
							canUseHint={canUseHint}
							aiClueMode
							label={`Pista (${cluesLeft})`}
							description="Mantén premut per rebre la pista d'una paraula i veure on comença al tauler"
							onHint={handleHint}
						/>
					)}
					{isDesktop ? null : (
						<QuadratWordSheet foundCount={foundCount} totalWords={totalWords}>
							{wordList}
						</QuadratWordSheet>
					)}
				</div>
			</div>
		</div>
	);
}
