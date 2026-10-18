import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PuzzleCompletionBanner } from "@/components/puzzle/puzzle-completion-banner";
import { PuzzleConfetti } from "@/components/puzzle/puzzle-confetti";
import { PuzzleGuessDisplay } from "@/components/puzzle/puzzle-guess-display";
import { PuzzleHintButton } from "@/components/puzzle/puzzle-hint-button";
import { PuzzleLoadingPage } from "@/components/puzzle/puzzle-loading";
import { useDailyRollover } from "@/components/puzzle/use-daily-rollover";
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
import { useQuadratDecoded } from "./use-quadrat-decoded";
import { useQuadratProgress } from "./use-quadrat-progress";

const FOUND_FLASH_MS = 700;
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
		useSubmitFeedback();

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
		}, FOUND_FLASH_MS);
	}, []);

	const handlePathChange = useCallback(
		(next: number[]) => {
			clearSubmitFeedback();
			setPath(next);
		},
		[clearSubmitFeedback],
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

	return (
		<div className="mx-auto flex h-full max-w-5xl flex-col gap-3 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:grid lg:grid-cols-2 lg:gap-10 lg:px-6 lg:pt-6 lg:pb-6">
			<PuzzleConfetti fire={celebrate && displayComplete} />
			<section
				aria-label="Paraules del dia"
				className="min-h-0 flex-1 overflow-y-auto lg:order-2 lg:h-full"
			>
				{displayComplete ? (
					<PuzzleCompletionBanner>
						<p className="text-sm text-muted-foreground font-ui">
							{visibleProgress.guessCount} intents ·{" "}
							{visibleProgress.hintsUsed === 1
								? "1 pista"
								: `${visibleProgress.hintsUsed} pistes`}
						</p>
					</PuzzleCompletionBanner>
				) : null}
				{expired ? (
					<p role="status" className="mb-2 text-sm text-muted-foreground">
						Estem preparant el nou Garbuix quadrat...
					</p>
				) : null}
				{syncFailed ? (
					<p role="status" className="mb-2 text-sm text-muted-foreground">
						Progrés desat al navegador. Es sincronitzarà quan torni la connexió.
					</p>
				) : null}
				{decoded.hasError ? (
					<Button variant="outline" onClick={decoded.retry} className="mb-2">
						Torna a carregar el tauler
					</Button>
				) : null}
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
			</section>
			<div className="flex shrink-0 flex-col items-center gap-6 lg:order-1 lg:justify-center lg:gap-8">
				{displayComplete ? null : (
					<PuzzleGuessDisplay
						currentGuess={getWordFromPath(puzzle.letters, path).toUpperCase()}
						submitFeedback={submitFeedback}
					/>
				)}
				<div className="w-full max-w-[min(24rem,48svh)]">
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
				{displayComplete ? null : (
					<PuzzleHintButton
						canUseHint={canUseHint}
						aiClueMode
						label={`Pista (${cluesLeft})`}
						description="Mantén premut per rebre la pista d'una paraula i veure on comença al tauler"
						onHint={handleHint}
					/>
				)}
			</div>
		</div>
	);
}
