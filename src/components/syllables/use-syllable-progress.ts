import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useBeforeAppReload } from "@/lib/app-reload";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import type {
	DailyPuzzlePublic,
	PuzzleProgressState,
} from "@/lib/puzzle-types";
import { readSyllableSaves, writeSyllableSave } from "@/lib/syllable-local";
import {
	applySyllableEvent,
	mergeSyllableProgress,
	type SyllableEvent,
} from "@/lib/syllable-progress";
import { syncSyllableProgress } from "@/lib/syllable-server-fns";

export function useSyllableProgress({
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
				writeSyllableSave(userId, puzzle.dateKey, next);
			} catch {
				toast.error("No s'ha pogut desar el progrés en aquest navegador.");
			}
		},
		[puzzle.dateKey, userId],
	);

	useEffect(() => {
		const own = readSyllableSaves(userId);
		const guest = userId ? readSyllableSaves(null) : {};
		for (const [date, saved] of Object.entries(guest))
			pending.current.set(date, saved);
		for (const [date, saved] of Object.entries(own))
			pending.current.set(
				date,
				mergeSyllableProgress(pending.current.get(date) ?? null, saved),
			);
		const local = pending.current.get(puzzle.dateKey);
		const merged = local
			? mergeSyllableProgress(initialProgress, local)
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
					const synced = await syncSyllableProgress({ data: saved });
					if (cancelled) return;
					if (pending.current.get(dateKey) === saved)
						pending.current.delete(dateKey);
					if (dateKey === puzzle.dateKey) {
						const merged = mergeSyllableProgress(synced, current.current);
						current.current = merged;
						setProgress(merged);
						persist(merged);
					} else writeSyllableSave(userId, dateKey, synced);
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
		(event: SyllableEvent) => {
			if (!ready) return;
			const next = applySyllableEvent(puzzle, current.current, event);
			if (next === current.current) return;
			current.current = next;
			setProgress(next);
			persist(next);
			pending.current.set(puzzle.dateKey, next);
		},
		[persist, puzzle, ready],
	);

	useBeforeAppReload(() => {
		if (!ready) throw new Error("Progress is still loading");
		for (const [dateKey, saved] of pending.current) {
			writeSyllableSave(userId, dateKey, saved);
		}
		writeSyllableSave(userId, puzzle.dateKey, current.current);
	});

	return { progress, ready, dispatch, syncFailed };
}
