import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useBeforeAppReload } from "@/lib/app-reload";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import type { PuzzleProgressState } from "@/lib/puzzle-types";
import { readQuadratSaves, writeQuadratSave } from "@/lib/quadrat-local";
import {
	applyQuadratEvent,
	mergeQuadratProgress,
	type QuadratEvent,
} from "@/lib/quadrat-progress";
import { syncQuadratProgress } from "@/lib/quadrat-server-fns";
import type { QuadratPuzzlePublic } from "@/lib/quadrat-types";

const SYNC_INTERVAL_MS = 3000;

function createEmptyQuadratProgress(
	puzzle: QuadratPuzzlePublic,
): PuzzleProgressState {
	return createEmptyProgressState({
		id: puzzle.id,
		initialShuffledLetters: [],
	});
}

// Browser saves first, then the account when signed in. Guest saves join the
// account on the first sync after signing in.
export function useQuadratProgress({
	puzzle,
	initialProgress,
	userId,
}: {
	puzzle: QuadratPuzzlePublic;
	initialProgress: PuzzleProgressState | null;
	userId: string | null;
}) {
	const [progress, setProgress] = useState(
		() => initialProgress ?? createEmptyQuadratProgress(puzzle),
	);
	const current = useRef(progress);
	const [ready, setReady] = useState(false);
	const [syncFailed, setSyncFailed] = useState(false);
	// Whether today's latest moves have reached the account. Clues for an
	// account are only served once the server knows they were asked for.
	const [syncPending, setSyncPending] = useState(false);
	const pending = useRef(new Map<string, PuzzleProgressState>());
	const flushRef = useRef<() => void>(() => {});

	const persist = useCallback(
		(next: PuzzleProgressState) => {
			try {
				writeQuadratSave(userId, puzzle.dateKey, next);
			} catch (error) {
				// Full or blocked storage: the account still gets the progress.
				if (!(error instanceof DOMException)) throw error;
				toast.error("No s'ha pogut desar el progrés en aquest navegador.");
			}
		},
		[puzzle.dateKey, userId],
	);

	useEffect(() => {
		const own = readQuadratSaves(userId);
		const guest = userId ? readQuadratSaves(null) : {};
		for (const [date, saved] of Object.entries(guest))
			pending.current.set(date, saved);
		for (const [date, saved] of Object.entries(own))
			pending.current.set(
				date,
				mergeQuadratProgress(pending.current.get(date) ?? null, saved),
			);
		const local = pending.current.get(puzzle.dateKey);
		const merged = local
			? mergeQuadratProgress(initialProgress, local)
			: (initialProgress ?? createEmptyQuadratProgress(puzzle));
		current.current = merged;
		setProgress(merged);
		if (local) {
			pending.current.set(puzzle.dateKey, merged);
			persist(merged);
		}
		setReady(true);
	}, [initialProgress, persist, puzzle, userId]);

	useEffect(() => {
		if (!ready || !userId) return;
		let cancelled = false;
		let busy = false;
		let again = false;
		async function flush() {
			if (cancelled) return;
			if (busy) {
				again = true;
				return;
			}
			busy = true;
			try {
				for (const [dateKey, saved] of pending.current) {
					if (cancelled) return;
					const synced = await syncQuadratProgress({ data: saved });
					if (cancelled) return;
					if (pending.current.get(dateKey) === saved)
						pending.current.delete(dateKey);
					if (dateKey === puzzle.dateKey) {
						const merged = mergeQuadratProgress(synced, current.current);
						current.current = merged;
						setProgress(merged);
						persist(merged);
					} else writeQuadratSave(userId, dateKey, synced);
				}
				setSyncFailed(false);
				setSyncPending(pending.current.has(puzzle.dateKey));
			} catch (error) {
				if (cancelled) return;
				// Offline or a server error: keep the moves and retry on the timer.
				console.warn("[quadrat] Progress sync failed", error);
				setSyncFailed(true);
			} finally {
				busy = false;
				if (again && !cancelled) {
					again = false;
					void flush();
				}
			}
		}
		flushRef.current = () => void flush();
		void flush();
		const timer = window.setInterval(flush, SYNC_INTERVAL_MS);
		window.addEventListener("online", flush);
		return () => {
			cancelled = true;
			flushRef.current = () => {};
			clearInterval(timer);
			window.removeEventListener("online", flush);
		};
	}, [persist, puzzle.dateKey, ready, userId]);

	const dispatch = useCallback(
		(event: QuadratEvent) => {
			if (!ready) return;
			const next = applyQuadratEvent(puzzle, current.current, event);
			if (next === current.current) return;
			current.current = next;
			setProgress(next);
			persist(next);
			if (!userId) return;
			pending.current.set(puzzle.dateKey, next);
			setSyncPending(true);
			flushRef.current();
		},
		[persist, puzzle, ready, userId],
	);

	useBeforeAppReload(() => {
		if (!ready) throw new Error("Progress is still loading");
		for (const [dateKey, saved] of pending.current) {
			writeQuadratSave(userId, dateKey, saved);
		}
		writeQuadratSave(userId, puzzle.dateKey, current.current);
	});

	return { progress, ready, dispatch, syncFailed, syncPending };
}
