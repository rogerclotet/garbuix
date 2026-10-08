import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSubmitFeedbackDuration } from "@/components/puzzle/puzzle-animation-timing";
import { buildHistoryEntry } from "@/lib/puzzle-helpers";
import { getSortedAnonymousHistoryEntries } from "@/lib/puzzle-local";
import {
	calculateHistoryStreaks,
	upsertHistoryEntry,
} from "@/lib/puzzle-streaks";
import type { PuzzleProgressState } from "@/lib/puzzle-types";
import { useClueRequests } from "@/lib/use-clue-requests";
import type { DailyData, DailySessionUser } from "./daily-types";

export function useDailyCompletion({
	initialData,
	activeUser,
	derivedProgress,
}: {
	initialData: DailyData;
	activeUser: DailySessionUser;
	derivedProgress: PuzzleProgressState;
}) {
	const puzzle = initialData.puzzle;
	const totalWords = puzzle.wordSlots.length;
	const justCompletedRef = useRef(false);
	const completionScheduledRef = useRef(false);
	const completionTransitionTimerRef = useRef<number | null>(null);
	const [isCompletionPending, setIsCompletionPending] = useState(false);
	const [shouldFireConfetti, setShouldFireConfetti] = useState(false);
	const [winDialogOpen, setWinDialogOpen] = useState(false);
	const winDialogTimerRef = useRef<number | null>(null);
	const [anonymousHistoryEntries, setAnonymousHistoryEntries] = useState(
		() => initialData.historyEntries ?? [],
	);

	useEffect(
		() => () => {
			if (completionTransitionTimerRef.current != null)
				window.clearTimeout(completionTransitionTimerRef.current);
			if (winDialogTimerRef.current != null)
				window.clearTimeout(winDialogTimerRef.current);
		},
		[],
	);
	useEffect(() => {
		if (activeUser) {
			setAnonymousHistoryEntries(initialData.historyEntries ?? []);
			return;
		}

		setAnonymousHistoryEntries(getSortedAnonymousHistoryEntries());
	}, [activeUser, initialData.historyEntries]);

	const streakStats = useMemo(() => {
		const baseEntries = activeUser
			? (initialData.historyEntries ?? [])
			: anonymousHistoryEntries;
		const streakEntries = upsertHistoryEntry(
			baseEntries,
			buildHistoryEntry(puzzle, derivedProgress),
		);

		return calculateHistoryStreaks(streakEntries, {
			referenceDateKey: puzzle.dateKey,
		});
	}, [
		activeUser,
		anonymousHistoryEntries,
		derivedProgress,
		initialData.historyEntries,
		puzzle,
	]);

	const isComplete = derivedProgress.guessedWordIds.length === totalWords;
	const displayComplete = isComplete && !isCompletionPending;

	// Delay the visual completion state so the submit feedback animation plays first
	useEffect(() => {
		if (!isComplete) {
			if (completionTransitionTimerRef.current != null)
				window.clearTimeout(completionTransitionTimerRef.current);
			if (winDialogTimerRef.current != null)
				window.clearTimeout(winDialogTimerRef.current);
			completionScheduledRef.current = false;
			setIsCompletionPending(false);
			setShouldFireConfetti(false);
			setWinDialogOpen(false);
			return;
		}
		if (completionScheduledRef.current) return;
		completionScheduledRef.current = true;

		if (justCompletedRef.current) {
			// User just guessed the last word — wait for the feedback animation
			justCompletedRef.current = false;
			completionTransitionTimerRef.current = window.setTimeout(() => {
				setIsCompletionPending(false);
				setShouldFireConfetti(true);
				completionTransitionTimerRef.current = null;
				// Let confetti land before the modal pops up.
				winDialogTimerRef.current = window.setTimeout(() => {
					setWinDialogOpen(true);
					winDialogTimerRef.current = null;
				}, 900);
			}, getSubmitFeedbackDuration());
		} else {
			// Puzzle was already complete on load — show immediately, no confetti
			setIsCompletionPending(false);
		}
	}, [isComplete]);

	const { dateKey: clueRequestsDateKey, receivedClues } = useClueRequests();
	// Mirrors the leaderboard's count (publishLeaderboardForUser and the guest
	// endpoint): free clues plus one per word a friend delivered a clue for.
	const friendClueCount =
		clueRequestsDateKey === puzzle.dateKey
			? Object.keys(receivedClues).length
			: 0;
	const cluesUsed = derivedProgress.hintsUsed + friendClueCount;

	const completionStats = useMemo(() => {
		if (derivedProgress.guessedWordIds.length !== totalWords) return undefined;
		return {
			guessCount: derivedProgress.guessCount,
			hintsUsed: cluesUsed,
			completedAt: derivedProgress.completedAt,
			currentStreak: streakStats.currentStreak,
		};
	}, [
		cluesUsed,
		derivedProgress.completedAt,
		derivedProgress.guessCount,
		derivedProgress.guessedWordIds.length,
		streakStats.currentStreak,
		totalWords,
	]);

	const markCompleting = useCallback(() => {
		justCompletedRef.current = true;
		setIsCompletionPending(true);
	}, []);

	return {
		isComplete,
		displayComplete,
		shouldFireConfetti,
		winDialogOpen,
		setWinDialogOpen,
		streakStats,
		cluesUsed,
		completionStats,
		markCompleting,
	};
}
