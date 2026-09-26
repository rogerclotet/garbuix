import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { readMiniSaves, writeMiniSave } from "@/lib/mini-local";
import {
	applyMiniEvent,
	type MiniEvent,
	mergeMiniProgress,
} from "@/lib/mini-progress";
import { syncMiniProgress } from "@/lib/mini-server-fns";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import type {
	DailyPuzzlePublic,
	PuzzleProgressState,
} from "@/lib/puzzle-types";

export function useMiniProgress({
	puzzle,
	initialProgress,
	userId,
}: {
	puzzle: DailyPuzzlePublic;
	initialProgress: PuzzleProgressState | null;
	userId: string | null;
}) {
	const [progress, setProgress] = useState(
		initialProgress ?? createEmptyProgressState(puzzle),
	);
	const current = useRef(progress);
	const [ready, setReady] = useState(false);
	const [syncFailed, setSyncFailed] = useState(false);
	const pending = useRef(new Map<string, PuzzleProgressState>());

	const persist = useCallback(
		(next: PuzzleProgressState) => {
			try {
				writeMiniSave(userId, puzzle.dateKey, next);
			} catch {
				toast.error("No s'ha pogut desar el progrés en aquest navegador.");
			}
		},
		[puzzle.dateKey, userId],
	);

	useEffect(() => {
		const own = readMiniSaves(userId);
		const guest = userId ? readMiniSaves(null) : {};
		for (const [date, saved] of Object.entries(guest))
			pending.current.set(date, saved);
		for (const [date, saved] of Object.entries(own))
			pending.current.set(
				date,
				mergeMiniProgress(pending.current.get(date) ?? null, saved),
			);
		const local = pending.current.get(puzzle.dateKey);
		const merged = local
			? mergeMiniProgress(initialProgress, local)
			: (initialProgress ?? createEmptyProgressState(puzzle));
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
		async function flush() {
			if (busy || cancelled) return;
			busy = true;
			try {
				for (const [dateKey, saved] of pending.current) {
					if (cancelled) return;
					const synced = await syncMiniProgress({ data: saved });
					if (cancelled) return;
					if (pending.current.get(dateKey) === saved)
						pending.current.delete(dateKey);
					if (dateKey === puzzle.dateKey) {
						const merged = mergeMiniProgress(synced, current.current);
						current.current = merged;
						setProgress(merged);
						persist(merged);
					} else writeMiniSave(userId, dateKey, synced);
				}
				setSyncFailed(false);
			} catch {
				if (!cancelled) setSyncFailed(true);
			} finally {
				busy = false;
			}
		}
		void flush();
		const timer = window.setInterval(flush, 3000);
		window.addEventListener("online", flush);
		return () => {
			cancelled = true;
			clearInterval(timer);
			window.removeEventListener("online", flush);
		};
	}, [persist, puzzle.dateKey, ready, userId]);

	const dispatch = useCallback(
		(event: MiniEvent) => {
			if (!ready) return;
			const next = applyMiniEvent(puzzle, current.current, event);
			if (next === current.current) return;
			current.current = next;
			setProgress(next);
			persist(next);
			pending.current.set(puzzle.dateKey, next);
		},
		[persist, puzzle, ready],
	);

	return { progress, ready, dispatch, syncFailed };
}
