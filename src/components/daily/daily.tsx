import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { MiniAnnouncementDialog } from "@/components/mini/mini-announcement-dialog";
import { PuzzleConfetti } from "@/components/puzzle/puzzle-confetti";
import { PuzzleControls } from "@/components/puzzle/puzzle-controls";
import { PuzzleGrid } from "@/components/puzzle/puzzle-grid";
import { PuzzleLoadingPage } from "@/components/puzzle/puzzle-loading";
import { useDecodedProgress } from "@/components/puzzle/use-decoded-progress";
import { usePuzzleKeyboard } from "@/components/puzzle/use-puzzle-keyboard";
import { ANALYTICS_EVENT, GAME_MODE } from "@/lib/analytics-events";
import {
	getBonusCluesEnabled,
	getLetterLayout,
	type LetterLayout,
} from "@/lib/anon-identity";
import { WORD_LIST_SECTION_ID } from "@/lib/clue-request-types";
import { buildCellLetters, buildRevealedCells } from "@/lib/puzzle-helpers";
import { getDeviceId } from "@/lib/puzzle-local";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import { useActiveSessionUser } from "@/lib/use-active-session-user";
import { useObservability } from "@/lib/use-observability";
import { DailyFlyingLetters } from "./daily-flying-letters";
import { DailyStatus } from "./daily-status";
import type { DailyData, DailySessionUser } from "./daily-types";
import { DailyWordList } from "./daily-word-list";
import { SharePreviewDialog } from "./share-preview-dialog";
import { useDailyActions } from "./use-daily-actions";
import { useDailyAnimations } from "./use-daily-animations";
import { useDailyClues } from "./use-daily-clues";
import { useDailyCompletion } from "./use-daily-completion";
import { useDailyOnboarding } from "./use-daily-onboarding";
import { useDailyProgress } from "./use-daily-progress";
import { useDailyShare } from "./use-daily-share";
import { WelcomeDialog } from "./welcome-dialog";
import { WinDialog } from "./win-dialog";

// Room the classic keypad claims until it has reported its real height: roughly
// the circle arrangement, which is what the server renders. Only the first
// paint uses it, and only the board's size depends on it.
const CLASSIC_KEYPAD_FALLBACK_HEIGHT = "17rem";
// The width at which the board switches to its two-column desktop layout,
// where the keypad lives in a narrow side column. Matches the `lg:` breakpoint
// the classic layout is built on.
const DESKTOP_LAYOUT_QUERY = "(min-width: 1024px)";

// Starts false so the server and the first client render agree; the real value
// lands right after mount, before anything the player can act on.
function useIsDesktopLayout(): boolean {
	const [isDesktop, setIsDesktop] = useState(false);

	useEffect(() => {
		if (typeof window.matchMedia !== "function") {
			return;
		}

		const mediaQuery = window.matchMedia(DESKTOP_LAYOUT_QUERY);
		const update = () => setIsDesktop(mediaQuery.matches);

		update();
		mediaQuery.addEventListener("change", update);
		return () => mediaQuery.removeEventListener("change", update);
	}, []);

	return isDesktop;
}

export function Daily({ initialData }: { initialData: DailyData }) {
	return <DailySession key={initialData.puzzle.id} initialData={initialData} />;
}

function DailySession({ initialData }: { initialData: DailyData }) {
	const { activeUser, session } = useActiveSessionUser(initialData.sessionUser);
	const deviceId = useMemo(() => getDeviceId(), []);
	const progressState = useDailyProgress({ activeUser, deviceId, initialData });
	return (
		<DailyGame
			key={activeUser?.id ?? "anonymous"}
			initialData={initialData}
			activeUser={activeUser}
			progressState={progressState}
			sessionPending={session.isPending}
		/>
	);
}

function DailyGame({
	initialData,
	activeUser,
	progressState,
	sessionPending,
}: {
	initialData: DailyData;
	activeUser: DailySessionUser;
	progressState: ReturnType<typeof useDailyProgress>;
	sessionPending: boolean;
}) {
	const isDesktopLayout = useIsDesktopLayout();
	const puzzle = initialData.puzzle;
	const totalWords = puzzle.wordSlots.length;
	// A player can opt into any of the three arrangements via /preferencies.
	// Initialise to the default so SSR markup is deterministic, then read the
	// stored choice after mount.
	const [letterLayout, setLetterLayout] = useState<LetterLayout>("circle");
	useEffect(() => {
		setLetterLayout(getLetterLayout());
	}, []);
	// The line only fits the phone keypad; on a desktop the keys live in a narrow
	// side column, so a seven-across row falls back to the grid.
	const effectiveLetterLayout: LetterLayout =
		letterLayout === "line" && isDesktopLayout ? "grid" : letterLayout;
	// Bonus clues for valid off-puzzle words (default on; off = hardcore mode).
	// Read from localStorage on mount, so SSR renders the default first.
	const [bonusCluesEnabled, setBonusCluesEnabled] = useState(true);
	// Height of the keypad pinned to the bottom of the classic board. Measured
	// rather than assumed: which arrangement the letters use is a preference, and
	// each one is a different height.
	const [keypadHeight, setKeypadHeight] = useState<number | null>(null);
	const { captureEvent } = useObservability();
	const {
		applyLocalEvent,
		derivedProgress: liveProgress,
		pendingEventCount,
		isReady,
	} = progressState;

	const {
		snapshot: decoded,
		hasError: decodeFailed,
		retry: retryDecode,
	} = useDecodedProgress({
		puzzle,
		progress: liveProgress,
		userId: activeUser?.id ?? null,
		enabled:
			isReady &&
			(!sessionPending ||
				activeUser !== null ||
				(typeof navigator !== "undefined" && !navigator.onLine)),
	});
	const emptyProgress = useMemo(
		() => createEmptyProgressState(puzzle),
		[puzzle],
	);
	const derivedProgress = decoded?.progress ?? emptyProgress;
	const revealedAnswers = decoded?.answers ?? {};
	const hintLetters = decoded?.hints ?? {};
	const isPresentable = decoded !== null;

	useEffect(() => {
		setBonusCluesEnabled(getBonusCluesEnabled());
	}, []);

	useEffect(() => {
		captureEvent(ANALYTICS_EVENT.PUZZLE_LOADED, {
			game_mode: GAME_MODE.CLASSIC,
			date_key: puzzle.dateKey,
			is_authenticated: Boolean(activeUser),
			puzzle_id: puzzle.id,
			rows: puzzle.rows,
			total_words: totalWords,
		});
	}, [
		activeUser,
		captureEvent,
		puzzle.dateKey,
		puzzle.id,
		puzzle.rows,
		totalWords,
	]);

	const revealedCells = useMemo(
		() => buildRevealedCells(puzzle, derivedProgress),
		[puzzle, derivedProgress],
	);

	const cellLetters = useMemo(
		() => buildCellLetters(puzzle.wordSlots, revealedAnswers, hintLetters),
		[hintLetters, puzzle.wordSlots, revealedAnswers],
	);

	const {
		gridRef,
		gridEffects,
		flyingLettersProps,
		submitFeedback,
		showSubmitFeedback,
		clearSubmitFeedback,
		triggerFlyingLetters,
		handleLocateWord,
	} = useDailyAnimations(puzzle);
	const {
		isComplete,
		displayComplete,
		shouldFireConfetti,
		winDialogOpen,
		setWinDialogOpen,
		streakStats,
		completionStats,
		markCompleting,
	} = useDailyCompletion({ initialData, activeUser, derivedProgress });
	const { sharePreviewOpen, setSharePreviewOpen, handleShare } = useDailyShare({
		puzzle,
		revealedCells,
		guessedCount: derivedProgress.guessedWordIds.length,
		completionStats,
		isPresentable,
	});
	const {
		welcomeOpen,
		miniAnnouncementOpen,
		setMiniAnnouncementOpen,
		tutorialOpen,
		handleWelcomeOpenChange,
		handleWelcomeContinueAnonymous,
		handleWelcomeSignIn,
		signInWithGoogle,
	} = useDailyOnboarding({
		activeUser,
		isPresentable,
		derivedProgress,
		sharePreviewOpen,
		winDialogOpen,
	});
	const {
		clueGridCells,
		clueGridFading,
		clueTextsByWordId,
		canUseSelfHint,
		canRequestHelp,
		handleHint,
		handleRequestHelp,
		requestedHelpWordIds,
		receivedClues,
		incomingRequests,
		helpGivenRecords,
		respondToClue,
	} = useDailyClues({
		puzzle,
		derivedProgress,
		userId: activeUser?.id ?? null,
		pendingEventCount,
		revealedCells,
		cellLetters,
		applyLocalEvent,
	});
	const {
		currentGuess,
		triggerHaptic,
		runPressAction,
		runClickAction,
		handleGuess,
		handleLetterClick,
		handleBackspace,
		handleShuffle,
	} = useDailyActions({
		puzzle,
		derivedProgress,
		applyLocalEvent,
		cellLetters,
		revealedCells,
		bonusCluesEnabled,
		showSubmitFeedback,
		clearSubmitFeedback,
		triggerFlyingLetters,
		markCompleting,
	});
	usePuzzleKeyboard({
		enabled:
			isPresentable && !isComplete && !tutorialOpen && !miniAnnouncementOpen,
		letters: derivedProgress.shuffledLetters,
		guess: currentGuess,
		minimumGuessLength: 4,
		onLetter: handleLetterClick,
		onBackspace: handleBackspace,
		onSubmit: () => {
			void handleGuess();
		},
	});

	if (!isPresentable) {
		return (
			<PuzzleLoadingPage
				synchronizing={Boolean(activeUser)}
				onRetry={decodeFailed ? retryDecode : undefined}
			/>
		);
	}

	const keypadHeightCss =
		keypadHeight == null ? CLASSIC_KEYPAD_FALLBACK_HEIGHT : `${keypadHeight}px`;

	return (
		<>
			<PuzzleConfetti fire={shouldFireConfetti} />
			<DailyFlyingLetters {...flyingLettersProps} />
			<div
				// h-full, not min-h-full: the word list below the fold overflows this
				// box on purpose, so the board above it can be sized against the room
				// the viewport really has.
				className="h-full px-3 sm:px-4 lg:flex lg:min-h-0 lg:flex-col lg:px-8 pt-2 sm:pt-3 lg:pt-4 lg:pb-8"
				style={{ "--daily-keypad-h": keypadHeightCss } as CSSProperties}
			>
				<div className="mx-auto h-full w-full max-w-5xl lg:grid lg:h-auto lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_18rem] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-x-8 xl:grid-cols-[1fr_20rem]">
					{/* Above the fold: the meters and the board split the room left
					    between the header and the keypad pinned to the bottom, so the
					    board never pushes the word list around and never spills past
					    the keypad. On a desktop this dissolves into the two-column
					    grid, where the keypad sits in the flow of the right column. */}
					<div className="flex h-[calc(100%_-_var(--daily-keypad-h))] flex-col lg:contents">
						<div
							className={`mb-4 shrink-0 sm:mb-6 lg:col-span-2 lg:row-start-1 ${displayComplete ? "pt-2 sm:pt-0" : ""}`}
						>
							<DailyStatus
								progress={derivedProgress}
								totalWords={totalWords}
								displayComplete={displayComplete}
								currentStreak={streakStats.currentStreak}
								bonusCluesEnabled={bonusCluesEnabled}
							/>
						</div>

						<div
							ref={gridRef}
							className="flex min-h-0 flex-1 flex-col pb-2 lg:col-start-1 lg:row-start-2 lg:pb-8"
						>
							<PuzzleGrid
								fitHeight
								puzzle={puzzle}
								revealedCells={revealedCells}
								cellLetters={cellLetters}
								{...gridEffects}
								clueCells={clueGridCells}
								clueCellsFading={clueGridFading}
							/>
						</div>
					</div>

					<div className="mt-6 flex min-h-0 flex-col gap-6 lg:col-start-2 lg:row-start-2 lg:mt-0 lg:h-full lg:min-h-0">
						<PuzzleControls
							aiClueMode
							layout={effectiveLetterLayout}
							canUseHint={canUseSelfHint}
							currentGuess={currentGuess}
							hintsUsed={derivedProgress.hintsUsed}
							isComplete={displayComplete}
							onHeightChange={setKeypadHeight}
							shuffledLetters={derivedProgress.shuffledLetters}
							onBackspace={handleBackspace}
							onHint={() => {
								triggerHaptic();
								handleHint();
							}}
							onLetterClick={handleLetterClick}
							onShuffle={handleShuffle}
							onSubmitGuess={() => {
								void handleGuess();
							}}
							submitFeedback={submitFeedback}
							runClickAction={runClickAction}
							runPressAction={runPressAction}
						/>

						{/* The keypad floats over the bottom of the page, so the last
						    rows need room to clear it. */}
						<div
							id={WORD_LIST_SECTION_ID}
							className={`scroll-mt-4 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:pb-0 ${
								displayComplete
									? "pb-6"
									: "pb-[calc(var(--daily-keypad-h)_+_1rem)]"
							}`}
						>
							<DailyWordList
								puzzle={puzzle}
								guessedWordIds={derivedProgress.guessedWordIds}
								revealedAnswers={revealedAnswers}
								cellLetters={cellLetters}
								clueTextsByWordId={clueTextsByWordId}
								clueWordIds={derivedProgress.clueWordIds}
								foundClueTextsByWordId={clueTextsByWordId}
								onWordTap={handleLocateWord}
								canRequestHelp={canRequestHelp}
								requestedHelpWordIds={requestedHelpWordIds}
								peerCluesByWordId={receivedClues}
								onRequestHelp={(wordId) => {
									triggerHaptic();
									handleRequestHelp(wordId);
								}}
								incomingRequests={incomingRequests}
								helpGivenRecords={helpGivenRecords}
								onRespondToClue={respondToClue}
							/>
						</div>
					</div>
				</div>
			</div>
			<WelcomeDialog
				open={welcomeOpen}
				onOpenChange={handleWelcomeOpenChange}
				onSignIn={handleWelcomeSignIn}
				onContinueAnonymous={handleWelcomeContinueAnonymous}
			/>
			<MiniAnnouncementDialog
				open={miniAnnouncementOpen}
				onOpenChange={setMiniAnnouncementOpen}
			/>
			<SharePreviewDialog
				open={sharePreviewOpen}
				onOpenChange={setSharePreviewOpen}
				puzzle={puzzle}
				revealedCells={revealedCells}
				guessedCount={derivedProgress.guessedWordIds.length}
				totalWords={totalWords}
				completionStats={completionStats}
				onConfirm={() => {
					setSharePreviewOpen(false);
					void handleShare();
				}}
			/>
			<WinDialog
				open={winDialogOpen}
				onOpenChange={setWinDialogOpen}
				guessCount={derivedProgress.guessCount}
				hintsUsed={derivedProgress.hintsUsed}
				completedAt={derivedProgress.completedAt}
				currentStreak={streakStats.currentStreak}
				isAnonymous={!activeUser}
				onSignIn={() => {
					void signInWithGoogle("win_dialog");
				}}
			/>
		</>
	);
}
