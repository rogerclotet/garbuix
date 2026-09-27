import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createPuzzleEvent } from "@/lib/puzzle-client";
import {
	getSlotHintCellKey,
	getSortedWordSlots,
	getWordCellKeys,
} from "@/lib/puzzle-helpers";
import type {
	DailyPuzzlePublic,
	PuzzleClientEvent,
	PuzzleProgressState,
} from "@/lib/puzzle-types";
import { useClueRequests } from "@/lib/use-clue-requests";
import { useObservability } from "@/lib/use-observability";
import { useWordClues } from "@/lib/use-word-clues";

const CLUE_FETCH_LETTER_FALLBACK_MS = 8000;
const CLUE_GRID_HIGHLIGHT_MS = 5000;
const CLUE_GRID_FADE_MS = 600;
export function useDailyClues({
	puzzle,
	derivedProgress,
	userId,
	pendingEventCount,
	revealedCells,
	cellLetters,
	applyLocalEvent,
}: {
	puzzle: DailyPuzzlePublic;
	derivedProgress: PuzzleProgressState;
	userId: string | null;
	pendingEventCount: number;
	revealedCells: Set<string>;
	cellLetters: Map<string, string>;
	applyLocalEvent: (event: PuzzleClientEvent) => void;
}) {
	const { captureEvent } = useObservability();
	const totalWords = puzzle.wordSlots.length;
	// Word ids the player just asked a clue for; drained into a toast once the
	// clue text resolves. Reloads refetch every clue but add nothing here, so
	// they stay quiet.
	const pendingClueToastWordIdsRef = useRef<Set<number>>(new Set());
	// Transient grid highlight for a freshly requested AI clue: the gradient ring
	// shows for 5s, then fades back to the regular cell colors.
	const [clueGridCells, setClueGridCells] = useState<Set<string>>(new Set());
	const [clueGridFading, setClueGridFading] = useState(false);
	const clueGridFadeTimerRef = useRef<number | null>(null);
	const clueGridClearTimerRef = useRef<number | null>(null);
	const {
		subscribe: subscribeClueRequests,
		requestClue,
		resolveClue,
		incomingRequests,
		respondToClue,
		helpGivenRecords,
		receivedClues,
		requestedHelpWordIds,
		publishSolvedWordIds,
	} = useClueRequests();
	// Clues delivered by other players (receivedClues) and the words this player
	// asked help for (requestedHelpWordIds) both live in the provider so they
	// persist across SSE reconnects and page reloads (replayed in the snapshot).
	// Each response carries the responder's name so we can attribute the clue.
	const clueTextsByWordId = useWordClues({
		puzzleId: puzzle.id,
		userId,
		wordIds: [
			...derivedProgress.clueWordIds,
			...derivedProgress.guessedWordIds,
		],
		pendingEventCount,
	});

	// The clue-fetch effect reveals fallback letters off the latest progress
	// without re-firing on every reveal; keep the moving parts in a ref so the
	// effect can stay keyed on the requested clue words alone.
	const fallbackContextRef = useRef({
		revealedCells,
		applyLocalEvent,
		puzzle,
		clueTextsByWordId,
	});
	fallbackContextRef.current = {
		revealedCells,
		applyLocalEvent,
		puzzle,
		clueTextsByWordId,
	};

	const nextClueWordId = useMemo(() => {
		const { notFoundSlots } = getSortedWordSlots(
			puzzle.wordSlots,
			derivedProgress.guessedWordIds,
			cellLetters,
		);
		const requested = new Set(derivedProgress.clueWordIds);
		const candidates = notFoundSlots.filter((slot) => !requested.has(slot.id));
		if (candidates.length === 0) return null;
		const choice = candidates[Math.floor(Math.random() * candidates.length)];
		return choice?.id ?? null;
	}, [
		puzzle.wordSlots,
		derivedProgress.guessedWordIds,
		derivedProgress.clueWordIds,
		cellLetters,
	]);

	const clueWordIdsKey = derivedProgress.clueWordIds.join(",");

	// Light a clue word's grid ring for a few seconds, then fade it back to the
	// regular cell colors so it reads as a transient cue, not a permanent mark.
	// Only used for words that resolved to a real AI clue — letter fallbacks add
	// the letter without highlighting the word.
	const lightClueWordRing = useCallback(
		(wordId: number) => {
			const clueSlot = puzzle.wordSlots.find((slot) => slot.id === wordId);
			if (!clueSlot) return;

			if (clueGridFadeTimerRef.current != null) {
				window.clearTimeout(clueGridFadeTimerRef.current);
			}
			if (clueGridClearTimerRef.current != null) {
				window.clearTimeout(clueGridClearTimerRef.current);
			}
			setClueGridFading(false);
			setClueGridCells(getWordCellKeys(clueSlot));
			clueGridFadeTimerRef.current = window.setTimeout(() => {
				setClueGridFading(true);
				clueGridFadeTimerRef.current = null;
			}, CLUE_GRID_HIGHLIGHT_MS);
			clueGridClearTimerRef.current = window.setTimeout(() => {
				setClueGridCells(new Set());
				setClueGridFading(false);
				clueGridClearTimerRef.current = null;
			}, CLUE_GRID_HIGHLIGHT_MS + CLUE_GRID_FADE_MS);
		},
		[puzzle.wordSlots],
	);

	useEffect(() => {
		const pendingToasts = pendingClueToastWordIdsRef.current;
		for (const wordId of Array.from(pendingToasts)) {
			const clue = clueTextsByWordId[wordId];
			if (!clue) continue;
			toast("Pista", { description: clue, duration: 10000 });
			lightClueWordRing(wordId);
			pendingToasts.delete(wordId);
		}
	}, [clueTextsByWordId, lightClueWordRing]);

	// Letter fallback has its own timer, so waiting for progress sync or a rate
	// limit never leaves a spent hint without help. Late text can still arrive.
	useEffect(() => {
		if (clueWordIdsKey === "") return;
		const puzzleId = puzzle.id;
		const wordIds = clueWordIdsKey.split(",").map(Number);
		const timer = window.setTimeout(() => {
			const {
				revealedCells: currentRevealed,
				applyLocalEvent: apply,
				puzzle: currentPuzzle,
				clueTextsByWordId: clues,
			} = fallbackContextRef.current;
			if (currentPuzzle.id !== puzzleId) return;
			const revealed = new Set(currentRevealed);
			for (const wordId of wordIds) {
				if (clues[wordId]) continue;
				const slot = currentPuzzle.wordSlots.find((item) => item.id === wordId);
				if (!slot) continue;
				const cellKey = getSlotHintCellKey(currentPuzzle, slot);
				if (!cellKey || revealed.has(cellKey)) continue;
				revealed.add(cellKey);
				apply(createPuzzleEvent("text_hint_fallback", { wordId, cellKey }));
			}
		}, CLUE_FETCH_LETTER_FALLBACK_MS);
		return () => window.clearTimeout(timer);
	}, [clueWordIdsKey, puzzle.id]);

	const guessedWordIdsKey = derivedProgress.guessedWordIds.join(",");
	useEffect(() => {
		const wordIds =
			guessedWordIdsKey === "" ? [] : guessedWordIdsKey.split(",").map(Number);
		publishSolvedWordIds(wordIds);
	}, [publishSolvedWordIds, guessedWordIdsKey]);

	const handleHint = useCallback(() => {
		if (derivedProgress.hintsUsed >= 3) return;
		if (nextClueWordId == null) return;

		captureEvent({ event: "hint_requested", value: "text" });
		applyLocalEvent(
			createPuzzleEvent("text_hint_requested", {
				wordId: nextClueWordId,
			}),
		);
		pendingClueToastWordIdsRef.current.add(nextClueWordId);
		// The grid ring is lit only once the clue text resolves (see the
		// clue-fetch effect); a letter fallback adds the letter without it.
	}, [
		applyLocalEvent,
		captureEvent,
		derivedProgress.hintsUsed,
		nextClueWordId,
	]);

	// Self-serve hint availability: a hint remains in the budget AND there's an
	// unclued missing word to target.
	const canUseSelfHint =
		derivedProgress.hintsUsed < 3 && nextClueWordId != null;

	// Peer clue requests: ask other connected players for a clue about an unfound
	// word once self-serve hints can't help — either the 3-hint budget is spent,
	// or every missing word already has a clue so a remaining hint can't be spent
	// on a new one.
	const canRequestHelp =
		derivedProgress.guessedWordIds.length < totalWords && !canUseSelfHint;

	const handleRequestHelp = useCallback(
		(wordId: number) => {
			// Tell responders whether this player already unlocked the word's AI
			// clue, so they know copying it back into a reply wouldn't help.
			const hasAiClue = derivedProgress.clueWordIds.includes(wordId);
			// The provider tracks the pending state (optimistic add + rollback on
			// failure); here we only surface the failure to the player.
			void requestClue(wordId, hasAiClue).then((created) => {
				if (!created) {
					toast.error("No s'ha pogut demanar ajuda");
				}
			});
		},
		[derivedProgress.clueWordIds, requestClue],
	);

	// Toast clues as they arrive live. The clue itself is stored in the provider
	// (and replayed in the snapshot), so display doesn't depend on this firing.
	useEffect(() => {
		const unsubscribe = subscribeClueRequests((event) => {
			if (event.type !== "response") return;
			const { text, responderName } = event.response;
			toast(`Pista de ${responderName}`, {
				description: text,
				duration: 12000,
			});
		});
		return unsubscribe;
	}, [subscribeClueRequests]);

	// Once the asker finds a word they'd asked help for, the request is no longer
	// needed: resolve it so other players' badges/buttons clear. resolveClue also
	// drops the word from the provider's "waiting" state.
	useEffect(() => {
		const found = requestedHelpWordIds.filter((wordId) =>
			derivedProgress.guessedWordIds.includes(wordId),
		);
		if (found.length === 0) return;
		for (const wordId of found) {
			void resolveClue(wordId);
		}
	}, [derivedProgress.guessedWordIds, requestedHelpWordIds, resolveClue]);

	useEffect(
		() => () => {
			if (clueGridFadeTimerRef.current != null)
				window.clearTimeout(clueGridFadeTimerRef.current);
			if (clueGridClearTimerRef.current != null)
				window.clearTimeout(clueGridClearTimerRef.current);
		},
		[],
	);

	return {
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
	};
}
